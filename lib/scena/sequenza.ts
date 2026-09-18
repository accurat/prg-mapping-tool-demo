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
 * Il rettangolo che contiene un insieme di punti, con la possibilita' di
 * lasciarne fuori gli estremi.
 *
 * Serve perche' **un punto solo puo' decidere un'inquadratura**. Fra i
 * cinquecento negozi della rete ce n'e' uno alle Hawaii: preso alla lettera,
 * il rettangolo che li contiene tutti arriva a 157 gradi ovest, sposta il
 * centro di diciotto gradi in mezzo al Pacifico e costringe la camera ad
 * allargarsi per inquadrare l'oceano. E' la stessa ragione per cui il rilievo
 * taglia le altezze al novantanovesimo percentile.
 *
 * Con pochi punti — i superstiti di una stella — non si taglia niente: li'
 * ogni punto e' uno dei pochi che si vogliono vedere.
 */
function riquadroDi(
  punti: [number, number][],
  quota = 0,
): [[number, number], [number, number]] {
  const estremi = (valori: number[]) => {
    const ordinati = [...valori].sort((a, b) => a - b);
    const salto = Math.floor(ordinati.length * quota);
    return [ordinati[salto], ordinati[ordinati.length - 1 - salto]] as const;
  };
  const [ovest, est] = estremi(punti.map((p) => p[0]));
  const [sud, nord] = estremi(punti.map((p) => p[1]));
  return [
    [ovest, sud],
    [est, nord],
  ];
}

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
  | "rilievo"
  | "numeri";

/**
 * Il nome del momento, che dipende da dove sta l'inclinazione.
 *
 * Non e' cosmesi: nell'ordine invertito la stessa fase fa un'altra cosa — le
 * celle compaiono invece di emergere — e chiamarla «il potenziale emerge»
 * significherebbe annunciare qualcosa che non si vede.
 */
export function nomeFase(fase: Fase, inclinazione: Inclinazione): string {
  if (inclinazione === "fuoco" && fase === "colonne") return "the territory fills in";
  return NOMI_FASE[fase];
}

export const NOMI_FASE: Record<Fase, string> = {
  attesa: "waiting",
  preparazione: "preloading the corridor",
  globo: "the world connects",
  discesa: "descent from the globe",
  paese: "the whole country",
  colonne: "the potential emerges",
  lettura: "reading",
  appiattimento: "from data to place",
  archi: "the network lights up",
  fuoco: "closing in on the area",
  flusso: "goods in transit",
  rilievo: "the heights remain",
  numeri: "the numbers of the area",
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
 * Il colore del valore: **due colori, nessuna via di mezzo**.
 *
 * Sopra la meta' della scala giallo pieno, sotto blu pieno. Non e' una rampa
 * continua e non e' una tinta smorzata dalla trasparenza.
 *
 * La ragione viene da T9: a dodici metri la luminosita' non trasmette
 * differenze, e una rampa fra due tinte passa per dei mezzi toni che da lontano
 * non si distinguono ne' dall'uno ne' dall'altro estremo. Due colori pieni si
 * riconoscono a colpo d'occhio e si contano; venti gradazioni si guardano e
 * basta. Si perde la lettura fine — quanto e' alto un valore dentro la propria
 * meta' — ma quella la dicono gia' l'altezza e i pannelli.
 *
 * L'alfa che questa funzione restituisce e' sempre piena: le dissolvenze della
 * sequenza la moltiplicano dove servono, ma il colore in se' non e' mai
 * semitrasparente.
 */
const BLU: [number, number, number] = [56, 104, 240];
const GIALLO: [number, number, number] = [255, 190, 58];

export function coloreValore(t: number, alpha = 255): [number, number, number, number] {
  const [r, g, b] = t >= 0.5 ? GIALLO : BLU;
  return [r, g, b, alpha];
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
  /** Quanto e' ingrandito il raggio delle colonne, 1 = misura vera. */
  scalaStore?: number;
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
  inclinazione = "fuoco",
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

    /**
     * Quanto dura il tracciamento di un collegamento: **proporzionale alla sua
     * lunghezza**.
     *
     * Con una durata uguale per tutti, a ogni istante ogni collegamento e'
     * disegnato per la stessa *frazione* di se' — e una frazione uguale su
     * lunghezze diverse significa velocita' diverse. Il piu' lungo di questa
     * rete e' seicento volte il piu' corto: nei primi cento millisecondi le
     * rotte transcontinentali guadagnano gia' quaranta pixel mentre quelle
     * brevi restano invisibili, e a schermo si legge come una manciata di archi
     * che compaiono di colpo gia' fatti mentre gli altri devono ancora
     * cominciare.
     *
     * Legando la durata alla lunghezza, tutti si allungano alla **stessa
     * velocita' sullo schermo**: nessuno scatta avanti, e il tracciamento si
     * legge come un'unica cosa che cresce. La proporzione e' limitata agli
     * estremi, perche' un collegamento da undici chilometri non puo' durare un
     * millesimo del piu' lungo senza sparire dall'animazione.
     */
    const lunghezze = stores.map((store) => {
      const da = hubs[store.hub].position;
      const metriPerGrado = 111_320;
      return Math.hypot(
        (store.position[0] - da[0]) * metriPerGrado * Math.cos((da[1] * Math.PI) / 180),
        (store.position[1] - da[1]) * metriPerGrado,
      );
    });
    const riferimento =
      [...lunghezze].sort((x, y) => x - y)[Math.floor(lunghezze.length / 2)] || 1;

    return stores.map((store, indice) => {
      const da = hubs[store.hub].position;
      const a = store.position;

      // I collegamenti corrono **sopra** i segnaposto: partendo da terra i
      // primi chilometri di ogni arco restano dentro il volume della colonna
      // dell'hub, e le due geometrie si contendono la profondita'.
      //
      // L'altezza dell'arco e' una **proporzione della sua lunghezza**: con
      // un'altezza uguale per tutti, un collegamento corto riceverebbe una
      // guglia quasi verticale.
      const lunghezza = lunghezze[indice];
      const vertice = Math.min(
        dati.verticeMassimo,
        lunghezza * dati.proporzioneArco * (0.65 + store.value * 0.35),
      );

      const path: [number, number, number][] = [];
      const timestamps: number[] = [];
      const ritardo = store.rango * 90;
      const durata = DURATA * Math.max(0.3, Math.min(2.4, lunghezza / riferimento));
      for (let i = 0; i < CAMPIONI; i++) {
        const t = i / (CAMPIONI - 1);
        path.push([
          da[0] + (a[0] - da[0]) * t,
          da[1] + (a[1] - da[1]) * t,
          dati.altezzaSegnaposto + archProfile(t) * vertice,
        ]);
        timestamps.push(ritardo + t * durata);
      }
      return { path, timestamps, store };
    });
  }, [stores, hubs, dati.altezzaSegnaposto, dati.proporzioneArco, dati.verticeMassimo]);

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

  const superstiti = dati.superstiti;

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
        scalaStore = 1,
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

      /**
       * Scaglionata per **posizione in classifica** di distanza: ogni stella si
       * apre dal centro verso fuori, ma a ritmo costante.
       *
       * Con la distanza grezza il ritmo lo decideva la forma dei dati: su
       * questa rete un quarto dei collegamenti e' piu' corto di un decimo del
       * piu' lungo, quindi la gran parte delle colonne saliva nello stesso
       * istante. A schermo non si leggeva come una comparsa scaglionata ma come
       * un gruppo che appare di colpo.
       */
      const salitaLocale = (s: Store) =>
        Math.max(0, Math.min(1, (salita - s.rango * 0.55) / 0.45));

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
          radius: dati.raggioStore * scalaStore,
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
          /**
           * I percorsi restano **sempre nei dati**, e a nasconderli e' il
           * tempo: non si tolgono finche' non se ne vanno per davvero.
           *
           * Ieri li toglievo anche prima che la rete si accendesse, per
           * aggirare un difetto di precisione. Era un errore, e ha introdotto
           * qualcosa di peggio: la prima volta che uno strato riceve dei dati,
           * la scheda video deve costruirne gli attributi — qui cinquecento
           * percorsi da quarantaquattro punti — e quel lavoro sta dentro un
           * fotogramma solo. Cadendo all'istante in cui l'animazione parte, il
           * tempo avanza mentre il fotogramma e' bloccato, e quando il disegno
           * riprende gli archi sono gia' a meta': **compaiono gia' fatti**.
           *
           * E' la stessa ragione per cui le colonne esistono fin dal
           * precaricamento a opacita' zero. Il difetto di precisione si evita
           * invece facendo partire il tempo **sotto** il primo istante utile,
           * con un margine largo, invece che a filo dello zero.
           *
           * In coda si tolgono ancora, ma per un altro motivo: una geometria
           * del tutto trasparente continua a scrivere nel buffer di
           * profondita' e nasconderebbe le colonne che le passano davanti.
           */
          data: svanire >= 0.999 ? [] : percorsiAttivi,
          getPath: (p) => p.path,
          getTimestamps: (p) => p.timestamps,
          getColor: (p) => {
            const c = coloreValore(p.store.value);
            return [c[0], c[1], c[2], 255 * restaStore(p.store) * (1 - svanire)];
          },
          widthUnits: "pixels",
          getWidth: 6,
          /**
           * Nessuna dissolvenza lungo la scia.
           *
           * Serve un disegno progressivo, non una cometa: quello che e' stato
           * tracciato resta. Prima lo si otteneva allungando la scia molto
           * oltre la durata della sequenza, cosi' che la dissolvenza non
           * arrivasse mai a mordere — ma una scia lunga schiaccia verso lo zero
           * il confronto che decide cosa disegnare, ed e' da li' che venivano i
           * mezzi archi fermi sulla mappa. Chiedendo direttamente di non
           * dissolvere, la scia puo' restare corta quanto serve.
           */
          fadeTrail: false,
          trailLength: finePercorsi * 1.05,
          // Due unita' sotto il primo istante utile: a rete zero non si disegna
          // niente, e il confronto sta lontano dallo zero invece che a filo.
          currentTime: rete * finePercorsi - 2,
          updateTriggers: { getColor: [stretta, svanire] },
          ...under(labelId),
        }),

        new ColumnLayer<Hub>({
          id: "hub",
          data: hubAttivi,
          diskResolution: 6,
          radius: dati.raggioHub,
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
          // Presenti fin dal precaricamento, come la rete: cosi' gli attributi
          // si costruiscono quando sullo schermo non c'e' niente. Si tolgono
          // solo quando l'apertura e' finita per sempre.
          data: globo <= 0.002 && giroGlobo >= 0.999 ? [] : mondo.archi,
          getPath: (a) => a.path,
          getTimestamps: (a) => a.timestamps,
          // Bianchi, non nella scala del valore: qui non misurano niente, e
          // dare loro la tinta che altrove significa «quanto vale» sarebbe un
          // falso indizio nel momento in cui la sala impara a leggere i colori.
          getColor: [238, 244, 250, 225 * globo],
          widthUnits: "pixels",
          getWidth: 3,
          // Come la rete: niente dissolvenza, scia corta, e tempo che parte
          // sotto il primo istante utile.
          fadeTrail: false,
          trailLength: mondo.fine * 1.05,
          currentTime: giroGlobo * mondo.fine - 2,
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

      /**
       * Spegnimento selettivo con `?senza=id,id`.
       *
       * Serve a rispondere alla domanda «che cos'e' quella cosa a schermo»
       * senza doverla dedurre: si toglie uno strato per volta e si guarda cosa
       * sparisce. E' costato un giro di ipotesi sbagliate scoprire che
       * mancava.
       */
      const spenti =
        typeof window === "undefined"
          ? []
          : (new URLSearchParams(window.location.search).get("senza") ?? "")
              .split(",")
              .filter(Boolean);

      overlay.setProps({
        layers: spenti.length ? strati.filter((l) => !spenti.includes(String(l.id))) : strati,
        effects: [LUCE],
      });
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

    /**
     * L'arrivo, chiesto alla mappa come tutto il resto.
     *
     * E se coincide con il paese, **il secondo volo non si fa**.
     *
     * I cinquanta punti di rifornimento coprono quasi per intero gli Stati
     * Uniti: l'inquadratura che li contiene e quella che contiene il paese sono
     * praticamente la stessa. Volare comunque due volte produce, dopo la sosta,
     * uno spostamento di camera di pochi pixel — che non si legge come un
     * movimento ma come un difetto.
     *
     * Il confronto e' fra le due inquadrature, non fra i dati: su un perimetro
     * che coprisse un solo stato le due sarebbero diverse e i due voli
     * tornerebbero ad avere senso, senza dover cambiare niente.
     */
    const inquadraturaArrivo = m.cameraForBounds(
      // Un centesimo per lato: abbastanza a togliere l'isolato in mezzo
      // all'oceano, troppo poco per spostare il confine di una costa.
      riquadroDi(stores.map((negozio) => negozio.position), 0.01),
      { padding: 120 },
    );
    const vistaArrivo = {
      center: (inquadraturaArrivo?.center
        ? [
            "lng" in inquadraturaArrivo.center
              ? inquadraturaArrivo.center.lng
              : (inquadraturaArrivo.center as [number, number])[0],
            "lat" in inquadraturaArrivo.center
              ? inquadraturaArrivo.center.lat
              : (inquadraturaArrivo.center as [number, number])[1],
          ]
        : dati.centro) as [number, number],
      zoom: inquadraturaArrivo?.zoom ?? dati.zoomArrivo,
    };
    const unVoloSolo =
      Math.abs(vistaArrivo.zoom - vistaPaese.zoom) < 0.45 &&
      Math.hypot(
        vistaArrivo.center[0] - vistaPaese.center[0],
        vistaArrivo.center[1] - vistaPaese.center[1],
      ) < 3;
    // Se il volo e' uno solo, si atterra direttamente sull'inquadratura di
    // arrivo: la sosta sul paese avviene li', ed e' gia' il posto giusto.
    const primaMeta = unVoloSolo ? vistaArrivo : vistaPaese;

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
        { ...primaMeta, pitch: pitchDiscesa },
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
      ...primaMeta,
      /**
       * Il paese si guarda con l'inclinazione che avra' tutta la discesa.
       *
       * L'inclinazione e' **una sola e sta in un punto solo** della sequenza:
       * o nella discesa o nella stretta. Se il volo verso il paese arrivasse
       * sempre a picco per poi inclinarsi nel tratto successivo, nell'ordine
       * originale ci sarebbe un cambio di punto di vista in piu' — proprio nel
       * mezzo di una discesa che deve leggersi come un movimento solo.
       */
      pitch: pitchDiscesa,
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
    await anima(400, (dolce) => disegna({ hub: 1, etichette: dolce }), viva);
    await attendi(450);
    if (!viva()) return;

    if (!unVoloSolo) {
      setFase("discesa");
      m.flyTo({
        ...vistaArrivo,
        pitch: pitchDiscesa,
        bearing: 0,
        duration: 3000,
        essential: true,
      });
    }
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
    const arco = vistaArrivo.zoom - zoomPartenza;
    await anima(
      unVoloSolo ? 1200 : 3000,
      (_dolce, lineare) => {
        // Senza secondo volo lo zoom non cambia: l'ingrandimento e le
        // etichette si riassorbono allora sul tempo, che e' l'unica cosa che
        // si muove.
        const avanzamento =
          unVoloSolo || Math.abs(arco) < 0.05
            ? lineare
            : Math.max(0, Math.min(1, (m.getZoom() - zoomPartenza) / arco));
        disegna({
          hub: 1,
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
    // Il tempo lineare, non la curva addolcita: quella parte quasi ferma e poi
    // recupera, e il recupero si vede come un gruppo di colonne che compaiono
    // insieme dopo una pausa.
    if (inclinazione === "discesa") {
      await anima(2600, (_dolce, lineare) => disegna({ salita: lineare, hub: 1 }), viva);
    } else {
      await anima(
        2600,
        (_dolce, lineare) => disegna({ salita: lineare, piatto: 1, hub: 1 }),
        viva,
      );
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
    // Il tracciamento segue il tempo **lineare**, non la curva addolcita: quella
    // parte quasi ferma e poi recupera, e il recupero si vede come un gruppo di
    // collegamenti che compaiono insieme dopo una pausa.
    await anima(
      2600,
      (_dolce, lineare) => disegna({ salita: 1, piatto: 1, rete: lineare, hub: 1 }),
      viva,
    );

    await attendi(1800);
    if (!viva()) return;

    // Il movimento della camera e la dissolvenza avvengono **insieme**: se il
    // muro si svuotasse prima, la sala vedrebbe sparire dei dati e poi un
    // viaggio; cosi' vede una cosa sola, l'attenzione che si restringe.
    /**
     * L'inquadratura della stretta la calcola la mappa, non noi.
     *
     * Vale qui la stessa ragione della sosta sul paese: e' MapLibre a sapere
     * quanto e' grande la propria tela e come si traduce uno zoom in metri per
     * pixel. Una formula nostra e' gia' stata sbagliata una volta — con la
     * costante delle tessere da 256 pixel invece che da 512 — e il sintomo era
     * una camera che si fermava troppo lontano.
     */
    const bordiFuoco = riquadroDi([
      dati.hubs[dati.fuoco].position,
      ...[...dati.superstiti].map((s) => s.position),
    ]);
    const inquadraturaFuoco = m.cameraForBounds(bordiFuoco, { padding: 200 });

    setFase("fuoco");
    m.easeTo({
      center: inquadraturaFuoco?.center ?? dati.centroFuoco,
      zoom: inquadraturaFuoco?.zoom ?? dati.zoomFuoco,
      pitch: pitchFuoco,
      bearing: 0,
      duration: 3000,
      essential: true,
    });
    const zoomStretta = m.getZoom();
    const arcoStretta = (inquadraturaFuoco?.zoom ?? dati.zoomFuoco) - zoomStretta;
    await anima(3000, (_dolce, lineare) => {
      const p = Math.min(1, lineare / 0.5);
      // Le colonne si riassorbono seguendo lo zoom, non il tempo: una curva
      // temporale non puo' coincidere con il terreno che si allarga sotto,
      // perche' il volo non attraversa gli zoom in modo uniforme.
      const avvicinamento =
        arcoStretta === 0
          ? 1
          : Math.max(0, Math.min(1, (m.getZoom() - zoomStretta) / arcoStretta));
      const raggi = 1 + (dati.restringimentoFuoco - 1) * avvicinamento;
      disegna({
        salita: 1,
        piatto: 1,
        rete: 1,
        stretta: p * p * (3 - 2 * p),
        hub: 1,
        scalaStore: raggi,
      });
    }, viva);
    if (!viva()) return;

    setFase("flusso");
    const partenza = performance.now();
    const secondiDiFlusso = () => (performance.now() - partenza) / 1000;
    const giro = () => {
      if (!viva()) return;
      disegna({
        salita: 1,
        piatto: 1,
        rete: 1,
        stretta: 1,
        flusso: secondiDiFlusso(),
        hub: 1,
        scalaStore: dati.restringimentoFuoco,
      });
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
        scalaStore: dati.restringimentoFuoco,
      });
    }, viva);
    if (!viva()) return;
    disegna({
      salita: 1,
      piatto: 0,
      rete: 1,
      stretta: 1,
      svanire: 1,
      hub: 1,
      scalaStore: dati.restringimentoFuoco,
    });

    // Solo adesso i numeri.
    //
    // Finche' qualcosa si muove, un pannello e' una seconda cosa da guardare
    // nello stesso istante. Quando il rilievo si e' alzato la scena e' ferma, e
    // le cifre arrivano su qualcosa che la sala ha gia' visto invece di
    // competerci.
    await attendi(900);
    if (!viva()) return;
    setFase("numeri");
  }, [map, disegna, anima, dati, stores, inclinazione]);

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
