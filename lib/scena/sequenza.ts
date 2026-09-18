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
import { costruisciGlobo, type ArcoGlobo, type NodoGlobo } from "./globo";
import type { DatiScena } from "./dati";

export const START_ZOOM = 0.4;

/**
 * Lo zoom dell'apertura sul globo.
 *
 * Piu' alto di quello da cui parte il corridoio: a 0,4 il pianeta occupa un
 * quarto dell'altezza del muro, che va bene per un fotogramma di passaggio e
 * non per cinque secondi in cui il globo e' il soggetto. Qui riempie circa due
 * terzi dell'altezza, che su una superficie larga cinque volte tanto e' quanto
 * basta perche' sia un oggetto e non un puntino.
 */
export const ZOOM_GLOBO = 1.6;

/**
 * I confini della parte continentale degli Stati Uniti.
 *
 * Volutamente approssimati, e volutamente senza Alaska, Hawaii e territori: la
 * sosta serve a far riconoscere la forma del paese, e includere l'Alaska
 * costringerebbe a inquadrare mezzo emisfero per mostrare uno stato in cui non
 * si scendera' mai. Quello che avanza ai lati — Canada, Messico, oceano — non
 * e' un problema: e' il contesto.
 */
const BORDI_PAESE: [[number, number], [number, number]] = [
  [-125.0, 24.4],
  [-66.9, 49.4],
];

/**
 * Dove sta l'inclinazione nella sequenza.
 *
 * `discesa` e' l'ordine originale: si arriva inclinati, si guarda il rilievo in
 * prospettiva, e alla stretta finale ci si mette perpendicolari al suolo.
 *
 * `fuoco` e' l'ordine inverso: si arriva a picco — il paese si legge come una
 * carta, e quello che parla e' il colore — e si inclina solo quando la scena si
 * stringe su una stella, dove l'altezza delle celle ha qualcosa da dire e ci
 * sono poche cose in campo per leggerla.
 */
export type Inclinazione = "discesa" | "fuoco";

export type Fase =
  | "attesa"
  | "preparazione"
  | "globo"
  | "discesa"
  | "paese"
  | "colonne"
  | "lettura"
  | "appiattimento"
  | "archi"
  | "fuoco"
  | "flusso"
  | "rilievo";

/**
 * Il nome del momento, che dipende da dove sta l'inclinazione.
 *
 * Non e' cosmesi: nell'ordine invertito la stessa fase fa un'altra cosa — le
 * celle compaiono invece di emergere — e chiamarla «il potenziale emerge»
 * significherebbe annunciare qualcosa che non si vede.
 */
export function nomeFase(fase: Fase, inclinazione: Inclinazione): string {
  if (inclinazione === "fuoco" && fase === "colonne") return "il territorio si popola";
  return NOMI_FASE[fase];
}

export const NOMI_FASE: Record<Fase, string> = {
  attesa: "in attesa",
  preparazione: "precaricamento del corridoio",
  globo: "il mondo si collega",
  discesa: "discesa dal globo",
  paese: "il paese intero",
  colonne: "il potenziale emerge",
  lettura: "lettura",
  appiattimento: "da dato a luogo",
  archi: "la rete si accende",
  fuoco: "si stringe sull'area",
  flusso: "la merce scorre",
  rilievo: "restano le altezze",
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

/**
 * Lo stato della scena in un istante.
 *
 * Non e' il tempo della sequenza ma le sue grandezze: quanto sono emerse le
 * colonne, quanto sono appiattite, quanto e' tracciata la rete. Un momento puo'
 * essere disegnato da solo, in qualunque ordine, e questo e' il motivo per cui
 * due copioni diversi possono condividere lo stesso disegno.
 */
/** Un hub con il suo connettore e il suo nome, per l'inquadratura del paese. */
export type EtichettaHub = {
  da: [number, number];
  a: [number, number];
  nome: string;
  aDestra: boolean;
};

export type Momento = {
  /** Quanto sono emerse le colonne dal terreno, 0..1. */
  salita?: number;
  /** Quanto sono state appiattite a segnaposto, 0..1. */
  piatto?: number;
  /** Quanto e' stata tracciata la rete, 0..1. */
  rete?: number;
  /** Quanto e' svanito tutto cio' che non e' la stella scelta, 0..1. */
  stretta?: number;
  /** Secondi trascorsi dall'inizio del flusso di merce. */
  flusso?: number;
  /** Quanto si e' spenta la rete gia' tracciata, 0..1. */
  svanire?: number;
  /** Presenza dell'hub, 0..1. Dichiarata sempre: non segue nient'altro. */
  hub?: number;
  /** Quanto e' ingrandito l'hub rispetto alla sua misura, 1 = misura vera. */
  scalaHub?: number;
  /** Opacita' delle etichette degli hub, 0..1. Vivono solo sull'inquadratura del paese. */
  etichette?: number;
  /** Opacita' della scena di apertura sul globo, 0..1. */
  globo?: number;
  /** Avanzamento del tracciamento dei collegamenti sul globo, 0..1. */
  giroGlobo?: number;
};

export function useSequenza({
  map,
  labelId,
  dati,
  automatica = true,
  inclinazione = "discesa",
}: {
  map: MapHandle | null;
  labelId: string | undefined;
  dati: DatiScena;
  automatica?: boolean;
  inclinazione?: Inclinazione;
}) {
  const [fase, setFase] = useState<Fase>("attesa");
  const [prefetchMs, setPrefetchMs] = useState<number | null>(null);
  const overlayRef = useRef<MapLibreOverlay | null>(null);
  const avviata = useRef(false);
  const rafFlusso = useRef(0);
  /**
   * Quale esecuzione della sequenza e' quella buona.
   *
   * Una sequenza dura mezzo minuto e vive dentro una catena di attese: se ne
   * parte una seconda mentre la prima e' a meta', le due continuano a disegnare
   * sulla stessa scena e vince l'ultima che ha parlato. Non e' un caso di
   * scuola — basta un interruttore che faccia ripartire il volo — e il sintomo
   * e' perfido: la scena resta ferma a un momento passato mentre il pannello
   * annuncia quello giusto.
   *
   * Ogni esecuzione prende un numero. Dopo ogni attesa controlla di essere
   * ancora l'ultima, e se non lo e' si ritira in silenzio.
   */
  const corsa = useRef(0);
  /**
   * L'opacita' delle etichette, in un riferimento e non in uno stato.
   *
   * Cambia a ogni fotogramma per un paio di secondi: passarla da React
   * significherebbe un aggiornamento per fotogramma di un albero che non
   * cambia forma. Chi la disegna la legge dove sta.
   */
  const opacitaEtichette = useRef(0);

  useEffect(() => () => cancelAnimationFrame(rafFlusso.current), []);

  const { hubs, stores } = dati;
  const mondo = useMemo(() => costruisciGlobo(), []);

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
      const vertice = Math.min(
        dati.verticeMassimo,
        lunghezza * dati.proporzioneArco * (0.65 + store.value * 0.35),
      );

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
  }, [stores, hubs, dati.altezzaSegnaposto, dati.proporzioneArco, dati.verticeMassimo]);

  /**
   * I negozi che restano quando la scena si stringe.
   *
   * Ne restano dodici, scelti secondo **due criteri diversi**: i sei con il
   * potenziale piu' alto e i sei che movimentano piu' merce. Cosi' il
   * fotogramma finale non mostra una classifica sola ma mette a confronto due
   * domande — dove c'e' da crescere e dove gia' si lavora — che nei dati veri
   * non coincidono quasi mai.
   */
  /**
   * Dove si appoggiano le etichette degli hub.
   *
   * Su un anello attorno al gruppo, ciascuna nella direzione in cui gia' sta il
   * proprio hub rispetto al centro: cosi' non si incrociano e ognuna cade dalla
   * parte giusta. La distanza e' proporzionale all'estensione del gruppo e non
   * a una misura in pixel, perche' le etichette esistono solo in
   * un'inquadratura e li' la proporzione basta.
   *
   * Oltre una dozzina di hub non si mettono: cinquanta etichette su una vista
   * nazionale non identificano niente, coprono tutto.
   */
  const etichetteHub = useMemo(() => {
    if (hubs.length > 12) return [];
    const cx = hubs.reduce((s, h) => s + h.position[0], 0) / hubs.length;
    const cy = hubs.reduce((s, h) => s + h.position[1], 0) / hubs.length;
    const raggio = Math.max(
      0.6,
      ...hubs.map((h) => Math.hypot(h.position[0] - cx, h.position[1] - cy)),
    );
    return hubs.map((h, i) => {
      const dx = h.position[0] - cx;
      const dy = h.position[1] - cy;
      const lunghezza = Math.hypot(dx, dy);
      // Un hub esattamente al centro non ha una direzione: gli si assegna il
      // proprio posto sull'anello per indice, invece di lasciarlo decidere a
      // una divisione per zero.
      const angolo = lunghezza < 1e-6 ? (i / hubs.length) * Math.PI * 2 : Math.atan2(dy, dx);
      // Abbastanza lontane da non toccarsi fra loro ne' coprire i punti che
      // stanno indicando: con gli hub raggruppati, e' la distanza dell'anello
      // a fare tutto il lavoro di separazione.
      const distanza = raggio * 3.2;
      return {
        da: h.position,
        a: [cx + Math.cos(angolo) * distanza, cy + Math.sin(angolo) * distanza * 0.85] as [
          number,
          number,
        ],
        nome: dati.nomiHub[i] ?? `${i + 1}`,
        aDestra: Math.cos(angolo) >= 0,
      } satisfies EtichettaHub;
    });
  }, [hubs, dati.nomiHub]);

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
   * I valori arrivano in un oggetto e non in fila: sono sette, cambiano quasi
   * mai tutti insieme, e una chiamata come `disegna(1, 1, 1, 0, 0, 1)` non si
   * rilegge. Ogni momento della sequenza dichiara solo quello che sposta.
   */
  const disegna = useCallback(
    (momento: Momento) => {
      const overlay = overlayRef.current;
      if (!overlay) return;

      const {
        salita = 0,
        piatto = 0,
        rete = 0,
        stretta = 0,
        flusso = 0,
        svanire = 0,
        scalaHub = 1,
        etichette = 0,
        globo = 0,
        giroGlobo = 0,
      } = momento;
      opacitaEtichette.current = etichette;
      // L'hub ha una vita propria, dichiarata momento per momento: compare
      // durante la discesa, molto prima dei negozi, e resta li' anche quando
      // le celle tornano alte alla fine. Non segue nessun'altra grandezza —
      // legarlo all'appiattimento, come faceva prima, significava farlo
      // comparire e sparire per effetto di cose che non lo riguardano.
      const hub = momento.hub ?? 0;

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
                (1 - svanire) *
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
          // Una rete del tutto trasparente continuerebbe a scrivere nel buffer
          // di profondita' e a nascondere le colonne che le passano davanti:
          // a dissolvenza conclusa i percorsi vanno tolti dai dati, non solo
          // resi invisibili.
          data: svanire >= 0.999 ? [] : percorsiAttivi,
          getPath: (p) => p.path,
          getTimestamps: (p) => p.timestamps,
          getColor: (p) => {
            const c = coloreValore(p.store.value);
            return [c[0], c[1], c[2], 255 * restaStore(p.store) * (1 - svanire)];
          },
          widthUnits: "pixels",
          getWidth: 6,
          // La scia non svanisce mai: serve un disegno progressivo, non una cometa.
          trailLength: finePercorsi * 2,
          currentTime: rete * finePercorsi,
          updateTriggers: { getColor: [stretta, svanire] },
          ...under(labelId),
        }),

        new ColumnLayer<Hub>({
          id: "hub",
          data: hubAttivi,
          diskResolution: 6,
          radius: dati.raggioHub * scalaHub,
          extruded: true,
          getPosition: (h) => h.position,
          getElevation: () => dati.altezzaSegnaposto * hub,
          // Verde acqua: sta fuori dalla scala caldo-freddo che misura il
          // potenziale, quindi non si confonde con un negozio. L'hub non e' un
          // punto della scala, e' un'altra categoria.
          getFillColor: (h) => [80, 235, 200, 255 * hub * restaHub(h.index)],
          updateTriggers: { getElevation: hub, getFillColor: [hub, stretta] },
          ...under(labelId),
        }),

        /**
         * L'apertura sul globo.
         *
         * Nodi sui continenti e collegamenti che si tracciano uno alla volta,
         * mentre il mondo gira. Spariscono prima della discesa: da li' in poi
         * la scena parla di dati veri, e lasciare in campo degli ornamenti
         * inventati vorrebbe dire non far capire piu' quali sono quali.
         */
        new ColumnLayer<NodoGlobo>({
          id: "globo-nodi",
          data: globo > 0.002 ? mondo.nodi : [],
          diskResolution: 6,
          radius: 190_000,
          extruded: true,
          getPosition: (n) => n.position,
          // A questa scala un hub e' un'altra cosa per dimensione, non solo per
          // colore: da qui non si legge una tinta, si legge un ingombro.
          getElevation: (n) => (n.hub ? 520_000 : 170_000) * globo,
          getFillColor: (n) => {
            if (n.hub) return [80, 235, 200, 235 * globo];
            const c = coloreValore(n.valore);
            return [c[0], c[1], c[2], c[3] * globo];
          },
          updateTriggers: { getElevation: globo, getFillColor: globo },
        }),

        new TripsLayer<ArcoGlobo>({
          id: "globo-archi",
          data: globo > 0.002 ? mondo.archi : [],
          getPath: (a) => a.path,
          getTimestamps: (a) => a.timestamps,
          // Bianchi, non nella scala del valore: qui non misurano niente, e
          // dare loro la tinta che altrove significa «quanto vale» sarebbe un
          // falso indizio nel momento in cui la sala impara a leggere i colori.
          getColor: [238, 244, 250, 225 * globo],
          widthUnits: "pixels",
          getWidth: 3,
          trailLength: mondo.fine * 2,
          currentTime: giroGlobo * mondo.fine,
          updateTriggers: { getColor: globo },
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
      mondo,
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
  const anima = useCallback(
    (ms: number, aFotogramma: (dolce: number, lineare: number) => void, viva: () => boolean = () => true) => {
      return new Promise<void>((risolvi) => {
        const inizio = performance.now();
        const passo = (ora: number) => {
          if (!viva()) return risolvi();
          const lineare = Math.min(1, (ora - inizio) / ms);
          aFotogramma(lineare * lineare * (3 - 2 * lineare), lineare);
          if (lineare >= 1) return risolvi();
          requestAnimationFrame(passo);
        };
        requestAnimationFrame(passo);
      });
    },
    [],
  );

  const esegui = useCallback(async () => {
    const m = map;
    if (!m) return;
    cancelAnimationFrame(rafFlusso.current);

    const mia = ++corsa.current;
    const viva = () => corsa.current === mia;
    const attendi = (ms: number) =>
      new Promise<void>((r) => setTimeout(() => r(), ms));

    // L'inclinazione e' una sola, spostata: o sta nella discesa o sta nella
    // stretta. Averla in entrambe vorrebbe dire non cambiarla mai, e il
    // cambio di punto di vista e' proprio la cosa che si vuole avere.
    const pitchDiscesa = inclinazione === "discesa" ? dati.pitchArrivo : 0;
    const pitchFuoco = inclinazione === "discesa" ? 0 : dati.pitchArrivo;

    /**
     * L'inquadratura che contiene il paese.
     *
     * Chiesta alla mappa invece che calcolata: e' lei a sapere quanto e' grande
     * la sua tela e come si traduce uno zoom in metri per pixel. Un calcolo
     * nostro sarebbe una seconda versione della stessa formula, con una
     * costante sbagliata prima o poi.
     */
    const inquadratura = m.cameraForBounds(BORDI_PAESE, { padding: 80 });
    const vistaPaese = {
      center: (inquadratura?.center
        ? [
            "lng" in inquadratura.center
              ? inquadratura.center.lng
              : (inquadratura.center as [number, number])[0],
            "lat" in inquadratura.center
              ? inquadratura.center.lat
              : (inquadratura.center as [number, number])[1],
          ]
        : [-96, 37.5]) as [number, number],
      zoom: inquadratura?.zoom ?? 3.2,
    };

    setFase("preparazione");
    m.jumpTo({ center: dati.centro, zoom: START_ZOOM, pitch: 0, bearing: 0 });
    disegna({});
    const rapporto = await prefetchDescent(m, {
      center: dati.centro,
      // La sosta sul paese non cade nel corridoio, che e' una retta sul centro
      // di arrivo: va percorsa a parte o le sue tessere arriverebbero durante
      // il volo.
      tappe: [
        { center: [dati.centro[0] + 70, 22] as [number, number], zoom: ZOOM_GLOBO, pitch: 0 },
        { ...vistaPaese, pitch: 0 },
      ],
      fromZoom: START_ZOOM,
      toZoom: dati.zoomArrivo,
      // Il corridoio si precarica con l'inclinazione con cui lo si percorrera'
      // davvero: a picco e in prospettiva servono tessere diverse, e caricare
      // quelle sbagliate e' come non caricarne affatto.
      toPitch: pitchDiscesa,
    });
    if (!viva()) return;
    setPrefetchMs(rapporto.durationMs);
    await settle(m, 4000);
    if (!viva()) return;

    // Un volo solo, dal globo fino a destinazione, e **nessun cambio di
    // proiezione**: su un'inquadratura larga 5760 pixel la curvatura resta
    // percepibile anche a zoom alti, quindi non esiste un momento in cui il
    // passaggio da sfera a piano non si veda. L'unico modo per non farlo
    // vedere e' non farlo. Regge perche' la rete e' disegnata con percorsi e
    // non con archi: l'ArcLayer sotto vista sferica non viene disegnato.
    /**
     * L'apertura: il mondo che gira.
     *
     * La rotazione **porta il paese davanti** invece di fermarsi e lasciare il
     * lavoro alla discesa: si parte da una longitudine lontana e si arriva a
     * quella di destinazione, cosi' il volo non comincia con uno scarto
     * laterale. La velocita' cala verso la fine — il globo si posa invece di
     * inchiodare.
     *
     * Nel frattempo i collegamenti si tracciano uno alla volta, e i nodi
     * compaiono con loro.
     */
    setFase("globo");
    const GIRO = 70;
    m.jumpTo({
      center: [dati.centro[0] + GIRO, 22],
      zoom: ZOOM_GLOBO,
      pitch: 0,
      bearing: 0,
    });
    await anima(
      8000,
      (_dolce, lineare) => {
        // Non la curva addolcita: quella parte lenta, e un globo che parte
        // lento sembra fermo. Questa parte alla sua velocita' e frena.
        const avanzamento = 1 - (1 - lineare) ** 2;
        m.jumpTo({
          center: [dati.centro[0] + GIRO * (1 - avanzamento), 22 + (dati.centro[1] - 22) * avanzamento],
          zoom: ZOOM_GLOBO,
          pitch: 0,
          bearing: 0,
        });
        disegna({
          globo: Math.min(1, lineare / 0.12),
          giroGlobo: Math.min(1, lineare / 0.85),
        });
      },
      viva,
    );
    if (!viva()) return;

    setFase("discesa");
    m.flyTo({
      ...vistaPaese,
      // Il paese si guarda a picco anche quando il resto della discesa sara'
      // inclinato: e' un'inquadratura che serve a riconoscere una forma, e una
      // forma vista di scorcio e' un'altra forma.
      pitch: 0,
      bearing: 0,
      duration: 2800,
      essential: true,
    });
    // Gli hub compaiono **durante** questa prima tratta, non dopo.
    //
    // Sono la struttura fissa del territorio, non un dato che emerge: quando la
    // sala vede il paese, i punti di rifornimento ci sono gia'. I negozi
    // arrivano molto dopo, ed e' quella la differenza da far sentire — prima il
    // posto, poi quello che ci succede dentro.
    await anima(
      2800,
      (dolce, lineare) =>
        disegna({
          hub: dolce,
          scalaHub: dati.ingrandimentoHub,
          // L'apertura se ne va nella prima meta' della discesa: da qui in poi
          // in campo restano solo dati veri.
          globo: Math.max(0, 1 - lineare / 0.5),
          giroGlobo: 1,
        }),
      viva,
    );
    await attendi(200);
    if (!viva()) return;

    // La sosta. Senza, il paese sarebbe solo un fotogramma di passaggio e
    // nessuno in sala avrebbe il tempo di capire dove si sta andando.
    setFase("paese");
    await anima(
      700,
      (dolce) => disegna({ hub: 1, scalaHub: dati.ingrandimentoHub, etichette: dolce }),
      viva,
    );
    await attendi(1300);
    if (!viva()) return;

    setFase("discesa");
    m.flyTo({
      center: dati.centro,
      zoom: dati.zoomArrivo,
      pitch: pitchDiscesa,
      duration: 3000,
      essential: true,
    });
    /**
     * Gli hub tornano alla loro misura vera mentre ci si avvicina, e le
     * etichette se ne vanno.
     *
     * Il ridimensionamento **segue lo zoom, non il tempo**. Il volo di MapLibre
     * non attraversa gli zoom in modo uniforme — parte piano, accelera e frena
     * — quindi una scala guidata da una curva temporale, per quanto ben
     * scelta, resta indietro o va avanti rispetto al terreno che si allarga
     * sotto. Chiedendo alla mappa dove si trova a ogni fotogramma, le due cose
     * non possono che coincidere.
     */
    const zoomPartenza = m.getZoom();
    const arco = dati.zoomArrivo - zoomPartenza;
    await anima(
      3000,
      () => {
        const avanzamento =
          arco === 0 ? 1 : Math.max(0, Math.min(1, (m.getZoom() - zoomPartenza) / arco));
        disegna({
          hub: 1,
          scalaHub: dati.ingrandimentoHub + (1 - dati.ingrandimentoHub) * avanzamento,
          // Le etichette se ne vanno per prime: servivano a distinguere dei
          // punti lontani, e appena il volo comincia non sono piu' quello che
          // si sta guardando.
          etichette: Math.max(0, 1 - avanzamento / 0.3),
        });
      },
      viva,
    );
    disegna({ hub: 1 });
    await attendi(200);
    if (!viva()) return;

    /**
     * Le celle entrano in scena.
     *
     * Nell'ordine originale **crescono**: la camera e' inclinata, l'altezza si
     * vede, e vederla salire e' il momento in cui il rilievo dice quanto vale
     * un posto.
     *
     * Nell'ordine invertito la camera e' a picco, dove un'altezza non esiste:
     * farle crescere lo stesso significherebbe animare qualcosa che nessuno
     * puo' vedere, e far credere per due secondi che stia succedendo qualcosa
     * che non succede. Quindi **compaiono gia' basse**, e a entrare in scena e'
     * il colore. L'altezza arriva alla fine, quando c'e' un'angolazione da cui
     * leggerla.
     */
    setFase("colonne");
    if (inclinazione === "discesa") {
      await anima(2600, (t) => disegna({ salita: t, hub: 1 }), viva);
    } else {
      await anima(2600, (t) => disegna({ salita: t, piatto: 1, hub: 1 }), viva);
    }

    setFase("lettura");
    await attendi(2200);
    if (!viva()) return;

    // L'appiattimento esiste solo nell'ordine originale: nell'altro le celle
    // sono gia' segnaposto, e una fase che non sposta niente e' una pausa
    // travestita da passaggio.
    if (inclinazione === "discesa") {
      setFase("appiattimento");
      await anima(1600, (t) => disegna({ salita: 1, piatto: t, hub: 1 }), viva);
      await attendi(600);
      if (!viva()) return;
    }

    setFase("archi");
    await anima(2600, (t) => disegna({ salita: 1, piatto: 1, rete: t, hub: 1 }), viva);

    await attendi(1800);
    if (!viva()) return;

    // Il movimento della camera e la dissolvenza avvengono **insieme**: se il
    // muro si svuotasse prima, la sala vedrebbe sparire dei dati e poi un
    // viaggio; cosi' vede una cosa sola, l'attenzione che si restringe.
    setFase("fuoco");
    m.easeTo({
      center: dati.centroFuoco,
      zoom: dati.zoomFuoco,
      pitch: pitchFuoco,
      bearing: 0,
      duration: 3000,
      essential: true,
    });
    await anima(3000, (_dolce, lineare) => {
      const p = Math.min(1, lineare / 0.5);
      disegna({ salita: 1, piatto: 1, rete: 1, stretta: p * p * (3 - 2 * p), hub: 1 });
    }, viva);
    if (!viva()) return;

    setFase("flusso");
    const partenza = performance.now();
    const secondiDiFlusso = () => (performance.now() - partenza) / 1000;
    const giro = () => {
      if (!viva()) return;
      disegna({ salita: 1, piatto: 1, rete: 1, stretta: 1, flusso: secondiDiFlusso(), hub: 1 });
      rafFlusso.current = requestAnimationFrame(giro);
    };
    rafFlusso.current = requestAnimationFrame(giro);

    // Nell'ordine originale il flusso non ha una fine: da qui in poi la scena
    // resta viva, con la merce che continua a viaggiare.
    if (inclinazione === "discesa") return;

    /**
     * Nell'ordine inclinato c'e' un momento in piu', ed e' quello per cui
     * l'ordine e' stato invertito.
     *
     * Fin qui le celle sono rimaste segnaposto anche da vicino: la scena
     * parlava di luoghi e di merce, e un rilievo sotto gli archi sarebbe stato
     * una seconda cosa da guardare nello stesso istante. Adesso la rete si
     * spegne e **le colonne tornano a essere il dato**, viste dall'unica
     * angolazione da cui un'altezza si legge.
     *
     * La rete svanisce piu' in fretta di quanto le colonne salgano: le due
     * cose non devono accavallarsi, altrimenti si vede una confusione invece
     * di un cambio di argomento.
     */
    await attendi(6000);
    if (!viva()) return;
    cancelAnimationFrame(rafFlusso.current);
    setFase("rilievo");
    await anima(2600, (dolce, lineare) => {
      disegna({
        salita: 1,
        piatto: 1 - dolce,
        rete: 1,
        stretta: 1,
        flusso: secondiDiFlusso(),
        svanire: Math.min(1, lineare / 0.55),
        hub: 1,
      });
    }, viva);
    if (!viva()) return;
    disegna({ salita: 1, piatto: 0, rete: 1, stretta: 1, svanire: 1, hub: 1 });
  }, [map, disegna, anima, dati, inclinazione]);

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

  return { fase, prefetchMs, esegui, etichetteHub, opacitaEtichette };
}
