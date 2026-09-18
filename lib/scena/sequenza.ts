"use client";

/**
 * La sequenza della scena, estratta da T10 perche' T12 la ripete identica con
 * i pannelli sopra.
 *
 * Duplicarla sarebbe stato il modo peggiore di aggiungere una cornice: due
 * copie di settecento righe che si separano al primo ritocco, e una misura di
 * T12 che non direbbe piu' niente su T10. Qui la sequenza e' una sola e i dati
 * entrano da fuori, cosi' la differenza fra le due pagine e' esattamente
 * quello che si vuole misurare.
 *
 * Tutto quello che questo modulo sa lo ha imparato T10, e i commenti che
 * seguono sono il resoconto di quelle scoperte.
 */

import {
  AmbientLight,
  ColumnLayer,
  DirectionalLight,
  LightingEffect,
  MapLibreOverlay,
  ScatterplotLayer,
  TripsLayer,
} from "deck.gl";
import type { Layer } from "deck.gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MapHandle } from "@/components/lab/MapSurface";
import { prefetchDescent, settle, under } from "@/lib/lab/map";
import type { Hub, Store } from "@/lib/lab/network";
import type { DatiScena } from "./dati";

export const START_ZOOM = 0.4;

export type Fase =
  | "attesa"
  | "preparazione"
  | "discesa"
  | "colonne"
  | "lettura"
  | "appiattimento"
  | "archi"
  | "fuoco"
  | "flusso";

export const NOMI_FASE: Record<Fase, string> = {
  attesa: "in attesa",
  preparazione: "precaricamento del corridoio",
  discesa: "discesa dal globo",
  colonne: "il potenziale emerge",
  lettura: "lettura",
  appiattimento: "da dato a luogo",
  archi: "la rete si accende",
  fuoco: "si stringe su una stella",
  flusso: "la merce scorre",
};

/**
 * Profilo di altezza dell'arco.
 *
 * La partenza e l'arrivo devono restare ripidi: l'arco si stacca da terra
 * deciso, ed e' giusto cosi'. Quello che va addolcito e' **solo il vertice**,
 * che con un profilo sinusoidale arriva stretto e sembra una punta. Questa e'
 * una superellisse: a esponente 2 e' un arco di cerchio, sopra il 2,5 diventa
 * un tavolo con gli spigoli smussati.
 */
function archProfile(t: number): number {
  const EXPONENT = 2.05;
  const x = Math.abs(t * 2 - 1);
  return Math.pow(Math.max(0, 1 - Math.pow(x, EXPONENT)), 1 / EXPONENT);
}

/**
 * Un'unica illuminazione per tutta la sequenza, **senza ombre**.
 *
 * Con il passaggio delle ombre attivo l'ArcLayer non viene disegnato affatto, e
 * sostituire l'effetto mentre la scena e' in corso fa smettere deck.gl di
 * disegnare qualsiasi cosa. Va scelta una volta e lasciata stare, come
 * qualsiasi altro oggetto di deck.gl che non si ricrea a ogni fotogramma.
 */
const LUCE = new LightingEffect({
  ambient: new AmbientLight({ color: [255, 255, 255], intensity: 1.0 }),
  sun: new DirectionalLight({
    color: [255, 255, 255],
    intensity: 2.2,
    direction: [-1, -2.4, -1.2],
    _shadow: false,
  }),
});

/**
 * Colore caldo-freddo: a dodici metri la tinta e' l'unica cosa che trasmette
 * differenze, la luminosita' no (vedi T9). Quindi il valore sta nella tinta.
 */
export function coloreValore(t: number, alpha = 235): [number, number, number, number] {
  return [40 + t * 215, 70 + t * 95, 195 - t * 150, alpha];
}

/** Secondi che un carico impiega a percorrere il collegamento. */
const tempoCarico = (volume: number) => 4.4 - volume * 2.8;
/** Carichi contemporanei su un collegamento: da uno a cinque, secondo il volume. */
const quantiCarichi = (volume: number) => 1 + Math.round(volume * 4);

type Percorso = { path: [number, number, number][]; timestamps: number[]; store: Store };

export function useSequenza({
  map,
  labelId,
  dati,
  automatica = true,
}: {
  map: MapHandle | null;
  labelId: string | undefined;
  dati: DatiScena;
  automatica?: boolean;
}) {
  const [fase, setFase] = useState<Fase>("attesa");
  const [prefetchMs, setPrefetchMs] = useState<number | null>(null);
  const overlayRef = useRef<MapLibreOverlay | null>(null);
  const avviata = useRef(false);
  const rafFlusso = useRef(0);

  useEffect(() => () => cancelAnimationFrame(rafFlusso.current), []);

  const { hubs, stores } = dati;

  /**
   * I collegamenti come percorsi campionati, non come archi.
   *
   * Un arco e' una primitiva unica: si puo' far comparire o allungare, non
   * disegnare poco per volta. Allungarlo significa cambiargli la forma mentre
   * appare, che e' proprio l'effetto da evitare. Un percorso con dei tempi si
   * traccia invece lungo la sua traiettoria definitiva, che non cambia mai.
   */
  const percorsi = useMemo<Percorso[]>(() => {
    const CAMPIONI = 44;
    const DURATA = 100;
    return stores.map((store) => {
      const da = hubs[store.hub].position;
      const a = store.position;

      // I collegamenti corrono **sopra** i segnaposto: partendo da terra i
      // primi chilometri di ogni arco restano dentro il volume della colonna
      // dell'hub, e le due geometrie si contendono la profondita'.
      //
      // L'altezza dell'arco e' una **proporzione della sua lunghezza**: con
      // un'altezza uguale per tutti, un collegamento corto riceverebbe una
      // guglia quasi verticale.
      const metriPerGrado = 111_320;
      const dx = (a[0] - da[0]) * metriPerGrado * Math.cos((da[1] * Math.PI) / 180);
      const dy = (a[1] - da[1]) * metriPerGrado;
      const lunghezza = Math.hypot(dx, dy);
      const vertice = lunghezza * 0.45 * (0.65 + store.value * 0.35);

      const path: [number, number, number][] = [];
      const timestamps: number[] = [];
      const ritardo = store.reach * 90;
      for (let i = 0; i < CAMPIONI; i++) {
        const t = i / (CAMPIONI - 1);
        path.push([
          da[0] + (a[0] - da[0]) * t,
          da[1] + (a[1] - da[1]) * t,
          dati.altezzaSegnaposto + archProfile(t) * vertice,
        ]);
        timestamps.push(ritardo + t * DURATA);
      }
      return { path, timestamps, store };
    });
  }, [stores, hubs, dati.altezzaSegnaposto]);

  /**
   * I negozi che restano quando la scena si stringe.
   *
   * Ne restano dodici, scelti secondo **due criteri diversi**: i sei con il
   * potenziale piu' alto e i sei che movimentano piu' merce. Cosi' il
   * fotogramma finale non mostra una classifica sola ma mette a confronto due
   * domande — dove c'e' da crescere e dove gia' si lavora — che nei dati veri
   * non coincidono quasi mai.
   */
  const superstiti = useMemo(() => {
    const suoi = stores.filter((s) => s.hub === dati.fuoco);
    const perPotenziale = [...suoi].sort((a, b) => b.value - a.value).slice(0, 6);
    const perVolume = [...suoi].sort((a, b) => b.volume - a.volume).slice(0, 6);
    return new Set([...perPotenziale, ...perVolume]);
  }, [stores, dati.fuoco]);

  /**
   * Le versioni ridotte dei dati.
   *
   * Servono perche' **una geometria del tutto trasparente scrive comunque nel
   * buffer di profondita'**: un collegamento a opacita' zero continua a
   * nascondere quello che gli sta dietro. Azzerare l'opacita' non basta, gli
   * elementi vanno tolti dai dati — e si sostituiscono a fine transizione, non
   * a ogni fotogramma.
   */
  const storesRidotti = useMemo(() => stores.filter((s) => superstiti.has(s)), [stores, superstiti]);
  const percorsiRidotti = useMemo(
    () => percorsi.filter((p) => superstiti.has(p.store)),
    [percorsi, superstiti],
  );
  const finePercorsi = useMemo(
    () => Math.max(...percorsi.map((p) => p.timestamps[p.timestamps.length - 1])) + 1,
    [percorsi],
  );

  useEffect(() => {
    if (!map) return;
    const overlay = new MapLibreOverlay({ interleaved: true, layers: [], effects: [LUCE] });
    map.addControl(overlay);
    overlayRef.current = overlay;
    return () => {
      overlayRef.current = null;
      map.removeControl(overlay);
    };
  }, [map]);

  /**
   * Disegna la scena per un dato istante.
   *
   * `salita`   0..1  quanto sono emerse le colonne
   * `piatto`   0..1  quanto sono state appiattite a segnaposto
   * `rete`     0..1  quanto si e' estesa la rete
   * `stretta`  0..1  quanto e' svanito tutto cio' che non e' la stella scelta
   * `flusso`   secondi trascorsi dall'inizio del flusso
   */
  const disegna = useCallback(
    (salita: number, piatto: number, rete: number, stretta = 0, flusso = 0) => {
      const overlay = overlayRef.current;
      if (!overlay) return;

      // Una rampa lineare di opacita' su fondo nero non si legge come una
      // dissolvenza ma come uno spegnimento: serve una curva che rallenti
      // verso lo zero.
      const restaStore = (s: Store) => (superstiti.has(s) ? 1 : 1 - stretta);
      const restaHub = (i: number) => (i === dati.fuoco ? 1 : 1 - stretta);

      const finita = stretta >= 0.999;
      const storeAttivi = finita ? storesRidotti : stores;
      const percorsiAttivi = finita ? percorsiRidotti : percorsi;
      const hubAttivi = finita ? [hubs[dati.fuoco]] : hubs;

      /**
       * I carichi **partono tutti dall'hub**, a intervalli regolari, e dopo un
       * giro il collegamento e' a regime. Distribuirli dall'istante zero
       * avrebbe fatto apparire merce gia' a meta' strada, come se il viaggio
       * fosse cominciato prima della scena.
       */
      const carichi = (secondi: number) => {
        const fuori: { position: [number, number, number]; value: number; alpha: number }[] = [];
        if (secondi <= 0) return fuori;
        const ingresso = Math.min(1, secondi / 0.7);

        for (const percorso of percorsi) {
          if (!superstiti.has(percorso.store)) continue;
          const quanti = quantiCarichi(percorso.store.volume);
          const durata = tempoCarico(percorso.store.volume);
          const ultimo = percorso.path.length - 1;

          for (let k = 0; k < quanti; k++) {
            const trascorso = secondi - (k * durata) / quanti;
            if (trascorso < 0) continue;
            const avanzamento = (trascorso / durata) % 1;
            const dove = avanzamento * ultimo;
            const i = Math.min(ultimo - 1, Math.floor(dove));
            const f = dove - i;
            const a = percorso.path[i];
            const b = percorso.path[i + 1];
            const bordo = (x: number) => x * x * (3 - 2 * x);
            fuori.push({
              position: [
                a[0] + (b[0] - a[0]) * f,
                a[1] + (b[1] - a[1]) * f,
                a[2] + (b[2] - a[2]) * f,
              ],
              value: percorso.store.value,
              alpha:
                ingresso *
                bordo(Math.min(1, avanzamento / 0.08)) *
                bordo(Math.min(1, (1 - avanzamento) / 0.08)),
            });
          }
        }
        return fuori;
      };

      /** Scaglionata per distanza: ogni stella si apre dal centro verso fuori. */
      const salitaLocale = (s: Store) =>
        Math.max(0, Math.min(1, (salita - s.reach * 0.45) / 0.55));

      // I due strati esistono **sempre**, fin dal precaricamento: la prima
      // volta che la scheda video disegna un tipo di elemento deve preparare i
      // programmi di disegno, e quel lavoro sta dentro un solo fotogramma che
      // dura il doppio degli altri. Creandoli qui, quel fotogramma cade quando
      // sullo schermo non c'e' niente.
      const strati: Layer[] = [
        new ColumnLayer<Store>({
          id: "negozi",
          data: storeAttivi,
          diskResolution: 6,
          radius: dati.raggioStore,
          extruded: true,
          getPosition: (s) => s.position,
          getElevation: (s) => {
            const locale = salitaLocale(s);
            const dato = s.value * dati.altezzaDato * locale;
            const altezza = dato * (1 - piatto) + dati.altezzaSegnaposto * piatto * locale;
            // Svanendo rientrano nel terreno invece di restare in piedi e
            // sbiadire: un segnaposto trasparente ma alto resta un ingombro.
            return altezza * restaStore(s);
          },
          getFillColor: (s) => {
            const c = coloreValore(s.value);
            const l = salitaLocale(s);
            return [c[0], c[1], c[2], c[3] * (l * l * (3 - 2 * l)) * restaStore(s)];
          },
          updateTriggers: {
            getElevation: [salita, piatto, stretta],
            getFillColor: [salita, stretta],
          },
          ...under(labelId),
        }),

        new TripsLayer<Percorso>({
          id: "rete",
          data: percorsiAttivi,
          getPath: (p) => p.path,
          getTimestamps: (p) => p.timestamps,
          getColor: (p) => {
            const c = coloreValore(p.store.value);
            return [c[0], c[1], c[2], 255 * restaStore(p.store)];
          },
          widthUnits: "pixels",
          getWidth: 6,
          // La scia non svanisce mai: serve un disegno progressivo, non una cometa.
          trailLength: finePercorsi * 2,
          currentTime: rete * finePercorsi,
          updateTriggers: { getColor: stretta },
          ...under(labelId),
        }),

        new ColumnLayer<Hub>({
          id: "hub",
          data: hubAttivi,
          diskResolution: 6,
          radius: dati.raggioHub,
          extruded: true,
          getPosition: (h) => h.position,
          getElevation: () => dati.altezzaSegnaposto * piatto,
          // Verde acqua: sta fuori dalla scala caldo-freddo che misura il
          // potenziale, quindi non si confonde con un negozio. L'hub non e' un
          // punto della scala, e' un'altra categoria.
          getFillColor: (h) => [80, 235, 200, 255 * piatto * restaHub(h.index)],
          updateTriggers: { getElevation: piatto, getFillColor: [piatto, stretta] },
          ...under(labelId),
        }),

        new ScatterplotLayer<{ position: [number, number, number]; value: number; alpha: number }>({
          id: "carichi",
          data: carichi(flusso),
          radiusUnits: "pixels",
          getRadius: 5,
          billboard: true,
          getPosition: (c) => c.position,
          // Il carico ha il colore del proprio collegamento, schiarito quel
          // tanto che basta a staccarsi dalla linea su cui corre.
          getFillColor: (c) => {
            const col = coloreValore(c.value);
            const alza = (v: number) => v + (255 - v) * 0.35;
            return [alza(col[0]), alza(col[1]), alza(col[2]), 255 * c.alpha];
          },
          updateTriggers: { getFillColor: flusso > 0 },
        }),
      ];

      overlay.setProps({ layers: strati, effects: [LUCE] });
    },
    [
      stores,
      hubs,
      percorsi,
      storesRidotti,
      percorsiRidotti,
      finePercorsi,
      superstiti,
      labelId,
      dati.fuoco,
      dati.altezzaDato,
      dati.altezzaSegnaposto,
      dati.raggioStore,
      dati.raggioHub,
    ],
  );

  /**
   * Anima da 0 a 1 nel tempo dato.
   *
   * Passa sia il valore addolcito sia il progresso lineare: alcune cose devono
   * seguire il movimento e quindi l'addolcimento, altre devono avere una curva
   * propria riferita al tempo reale.
   */
  const anima = useCallback((ms: number, aFotogramma: (dolce: number, lineare: number) => void) => {
    return new Promise<void>((risolvi) => {
      const inizio = performance.now();
      const passo = (ora: number) => {
        const lineare = Math.min(1, (ora - inizio) / ms);
        aFotogramma(lineare * lineare * (3 - 2 * lineare), lineare);
        if (lineare >= 1) return risolvi();
        requestAnimationFrame(passo);
      };
      requestAnimationFrame(passo);
    });
  }, []);

  const esegui = useCallback(async () => {
    const m = map;
    if (!m) return;
    cancelAnimationFrame(rafFlusso.current);
    const attendi = (ms: number) => new Promise((r) => setTimeout(r, ms));

    setFase("preparazione");
    m.jumpTo({ center: dati.centro, zoom: START_ZOOM, pitch: 0, bearing: 0 });
    disegna(0, 0, 0);
    const rapporto = await prefetchDescent(m, {
      center: dati.centro,
      fromZoom: START_ZOOM,
      toZoom: dati.zoomArrivo,
      toPitch: dati.pitchArrivo,
    });
    setPrefetchMs(rapporto.durationMs);
    await settle(m, 4000);

    // Un volo solo, dal globo fino a destinazione, e **nessun cambio di
    // proiezione**: su un'inquadratura larga 5760 pixel la curvatura resta
    // percepibile anche a zoom alti, quindi non esiste un momento in cui il
    // passaggio da sfera a piano non si veda. L'unico modo per non farlo
    // vedere e' non farlo. Regge perche' la rete e' disegnata con percorsi e
    // non con archi: l'ArcLayer sotto vista sferica non viene disegnato.
    setFase("discesa");
    m.flyTo({
      center: dati.centro,
      zoom: dati.zoomArrivo,
      pitch: dati.pitchArrivo,
      duration: 6000,
      essential: true,
    });
    await attendi(6200);

    setFase("colonne");
    await anima(2600, (t) => disegna(t, 0, 0));

    setFase("lettura");
    await attendi(2200);

    setFase("appiattimento");
    await anima(1600, (t) => disegna(1, t, 0));

    await attendi(600);
    setFase("archi");
    await anima(2600, (t) => disegna(1, 1, t));

    await attendi(1800);

    // Il movimento della camera e la dissolvenza avvengono **insieme**: se il
    // muro si svuotasse prima, la sala vedrebbe sparire dei dati e poi un
    // viaggio; cosi' vede una cosa sola, l'attenzione che si restringe.
    setFase("fuoco");
    m.easeTo({
      center: dati.centroFuoco,
      zoom: dati.zoomFuoco,
      pitch: 0,
      bearing: 0,
      duration: 3000,
      essential: true,
    });
    await anima(3000, (_dolce, lineare) => {
      const p = Math.min(1, lineare / 0.5);
      disegna(1, 1, 1, p * p * (3 - 2 * p));
    });

    // Il flusso non ha una fine: da qui in poi la scena resta viva.
    setFase("flusso");
    const partenza = performance.now();
    const giro = () => {
      disegna(1, 1, 1, 1, (performance.now() - partenza) / 1000);
      rafFlusso.current = requestAnimationFrame(giro);
    };
    rafFlusso.current = requestAnimationFrame(giro);
  }, [map, disegna, anima, dati]);

  useEffect(() => {
    if (!automatica || avviata.current || !map) return;
    avviata.current = true;
    void esegui();
  }, [map, esegui, automatica]);

  useEffect(() => {
    const suTasto = (e: KeyboardEvent) => {
      if (e.key === "r" || e.key === "R") void esegui();
    };
    window.addEventListener("keydown", suTasto);
    return () => window.removeEventListener("keydown", suTasto);
  }, [esegui]);

  return { fase, prefetchMs, esegui };
}
