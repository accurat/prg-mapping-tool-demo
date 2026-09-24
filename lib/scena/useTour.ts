"use client";

/**
 * La regia del tour delle storie (T13).
 *
 * T12 e' un film: una catena di attese che va dal globo alla stretta e li' si
 * ferma. Un tour davanti a un cliente non puo' esserlo, perche' chi presenta
 * deve poter tornare indietro, saltare, fermarsi su una storia mentre qualcuno
 * fa una domanda. Per questo qui la sequenza e' divisa in due:
 *
 * - l'**apertura** (globo, discesa, paese) resta una catena, come in T12: si
 *   guarda una volta, dall'inizio;
 * - il **giro** e' un comando, `vai(i)`, che si puo' chiamare in qualunque
 *   momento — anche a meta' di un volo — e che interrompe quello che stava
 *   succedendo. Il giro automatico non e' altro che `vai(i + 1)` chiamato alla
 *   fine di ogni sosta.
 *
 * Il disegno non segue le attese: un ciclo solo, a ogni fotogramma, legge lo
 * stato della scena da un riferimento e ricompone gli strati. Le attese
 * cambiano lo stato, il ciclo lo disegna. Cosi' due comandi che si accavallano
 * non possono disegnare due scene diverse sulla stessa mappa: il disegno e'
 * uno, ed e' sempre quello dello stato corrente.
 */

import {
  ColumnLayer,
  MapLibreOverlay,
  PathLayer,
  PolygonLayer,
  ScatterplotLayer,
  TripsLayer,
} from "deck.gl";
import type { Layer } from "deck.gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MapHandle } from "@/components/lab/MapSurface";
import { daMercatore, mercatore } from "@/lib/data/grid";
import { valuta } from "@/lib/format";
import { prefetchDescent, settle, under } from "@/lib/lab/map";
import { costruisciGlobo, type ArcoGlobo, type NodoGlobo } from "./globo";
import { BORDI_PAESE, LUCE, START_ZOOM, ZOOM_GLOBO, coloreValore } from "./sequenza";
import type { CellaTour, DatiTour, NegozioTour } from "./tour";

export type MomentoTour =
  | "attesa"
  | "preparazione"
  | "globo"
  | "discesa"
  | "paese"
  | "volo"
  | "tappa"
  | "ritorno";

export const NOMI_MOMENTO: Record<MomentoTour, string> = {
  attesa: "waiting",
  preparazione: "preloading the tour",
  globo: "the world",
  discesa: "descent",
  paese: "the whole country",
  volo: "flying to the next story",
  tappa: "the story",
  ritorno: "back to the country",
};

/** Quanto resta ferma la camera su una storia, in millisecondi. */
export const SOSTA_MS = 12_000;
/** Quanto resta sul paese prima che il giro cominci, e alla fine prima di ricominciare. */
const SOSTA_PAESE_MS = 6_000;

/** L'inclinazione del paese: abbastanza per leggere il rilievo, non tanto da schiacciarlo. */
const PITCH_PAESE = 38;
/** L'inclinazione sulle storie locali: quella di T10, da cui un'altezza si legge. */
const PITCH_LUOGO = 55;

/**
 * Lo spazio che i pannelli tolgono all'inquadratura, in pixel di muro.
 *
 * La camera deve mettere l'area **nel terzo centrale**: la regia del motore
 * calcola uno zoom per l'intero muro, e con quello i negozi finirebbero sotto
 * i pannelli laterali. Qui l'inquadratura la chiede alla mappa con i margini
 * veri, che e' l'unico modo di sapere cosa resta scoperto.
 */
const MARGINI_LUOGO = { top: 260, bottom: 300, left: 2050, right: 2050 };
const MARGINI_PAESE_STORIA = { top: 200, bottom: 200, left: 1950, right: 1950 };
const MARGINI_PAESE = { top: 200, bottom: 160, left: 420, right: 420 };

/** Rosso: sotto assedio e sotto il modello. Fuori dalla scala blu-giallo del valore. */
const ROSSO: [number, number, number] = [255, 86, 104];
/** Verde acqua: il campo libero. Lo stesso degli hub di T12, un'altra categoria. */
const ACQUA: [number, number, number] = [80, 235, 200];
const ACCENTO: [number, number, number] = [255, 179, 92];

type Vista = { center: [number, number]; zoom: number; pitch: number; bearing: number };

/**
 * Le misure che dipendono dall'inquadratura, calcolate una volta sola.
 *
 * Un negozio deve restare largo qualche pixel **a ogni tappa**, e le tappe
 * stanno a zoom diversi: una misura in metri fissa sarebbe un disco enorme su
 * Odessa e un puntino su Austin. Si parte quindi dai pixel e si torna ai metri
 * con la scala della tappa.
 */
type Misure = {
  paese: Vista;
  altezzaCelle: number;
  tappe: { vista: Vista; raggio: number; altezza: number; anello: number }[];
};

/** Lo stato della scena. Lo scrivono le attese, lo legge il disegno. */
type Stato = {
  globo: number;
  giroGlobo: number;
  /** L'onda che alza il rilievo da ovest a est, 0..1. */
  rilievo: number;
  /** Quanto sono alte le celle: 1 sul paese, 0 da vicino, dove diventano un pavimento. */
  alzate: number;
  /** La tappa a fuoco, o -1. */
  fuoco: number;
  /** Quanto si spegne tutto cio' che non e' la tappa, 0..1. */
  messaFuoco: number;
  /** Quanto sono emersi i negozi della tappa, 0..1. */
  apertura: number;
  /** Quanto e' acceso lo strato della storia, 0..1. */
  strato: number;
  /** Istante dell'arrivo sulla tappa, per l'impulso a terra. */
  arrivo: number;
  /** Quanto e' entrato l'alone del globo, 0..1: sale con calma all'apertura. */
  alone: number;
};

const INIZIALE: Stato = {
  globo: 0,
  giroGlobo: 0,
  rilievo: 0,
  alzate: 1,
  fuoco: -1,
  messaFuoco: 0,
  apertura: 0,
  strato: 0,
  arrivo: -Infinity,
  alone: 0,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const VUOTO: any[] = [];

/**
 * Gli strati a terra si disegnano **senza confronto di profondita'**.
 *
 * Un poligono piatto sul globo sta alla stessa quota delle tessere della mappa,
 * e da lontano la precisione non basta a decidere chi sta sopra: il pavimento
 * si riempie di strisce, e un cerchio lampeggia — un fotogramma vince lui, il
 * successivo la mappa. Vale per **tutto** quello che sta a quota zero:
 * dimenticarlo su un solo strato basta a farlo sfarfallare. Stanno sotto a tutto per costruzione — sono disegnati
 * prima delle colonne e sotto le etichette — quindi il confronto non serve.
 */
const A_TERRA = { depthCompare: "always", depthWriteEnabled: false } as const;

/**
 * Il raggio del globo nello spazio di lavoro della vista di deck.gl.
 *
 * E' una costante di deck.gl, non della Terra: la vista a globo disegna una
 * sfera di 256 unita' e tiene la camera nello stesso spazio. Verificato
 * proiettando il centro della mappa: la sua distanza dall'origine e' 256.
 */
const RAGGIO_DECK = 256;

type VistaDeck = {
  cameraPosition: number[];
  zoom: number;
  unprojectPosition: (p: number[]) => number[];
};

/**
 * Il bordo del globo come lo vede la camera, in gradi.
 *
 * E' il cerchio dei punti in cui lo sguardo e' tangente alla sfera: attorno
 * al punto sotto la camera, a una distanza angolare che dipende solo da quanto
 * la camera e' lontana dal centro. Vale a qualunque inclinazione — che e'
 * esattamente dove un anello disegnato sullo schermo smetteva di funzionare:
 * a camera inclinata il globo non e' piu' un disco centrato, e l'alone
 * spariva proprio nella discesa e sul paese, dove il bordo si vede ancora.
 */
function bordoDelGlobo(v: VistaDeck, punti = 160): [number, number][] | null {
  const c = v.cameraPosition;
  const d = Math.hypot(c[0], c[1], c[2]);
  if (!(d > RAGGIO_DECK * 1.0005)) return null;
  const u = c.map((x) => x / d);
  const angolo = Math.acos(RAGGIO_DECK / d);
  const coseno = Math.cos(angolo);
  const seno = Math.sin(angolo);

  // Due direzioni perpendicolari a quella della camera, e fra loro.
  const aiuto = Math.abs(u[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const vettoriale = (a: number[], b: number[]) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const grezzo = vettoriale(u, aiuto);
  const n = Math.hypot(grezzo[0], grezzo[1], grezzo[2]);
  const e1 = grezzo.map((x) => x / n);
  const e2 = vettoriale(u, e1);

  const fuori: [number, number][] = [];
  for (let k = 0; k <= punti; k++) {
    const f = (k / punti) * Math.PI * 2;
    const p = [0, 1, 2].map(
      (i) => RAGGIO_DECK * (coseno * u[i] + seno * (Math.cos(f) * e1[i] + Math.sin(f) * e2[i])),
    );
    const [lng, lat] = v.unprojectPosition(p);
    // Longitudini continue: un salto da +180 a -180 in mezzo all'anello
    // disegnerebbe una riga attraverso tutto il pianeta.
    const prima = fuori[fuori.length - 1];
    let continua = lng;
    if (prima) while (continua - prima[0] > 180) continua -= 360;
    if (prima) while (continua - prima[0] < -180) continua += 360;
    fuori.push([continua, lat]);
  }
  return fuori;
}

const dolce = (x: number) => x * x * (3 - 2 * x);
const limita = (x: number) => Math.max(0, Math.min(1, x));

/** Metri per pixel a uno zoom, con le tessere da 512 di MapLibre. */
const metriPerPixel = (zoom: number, lat: number) =>
  (78_271.517 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;

function centroDi(c: unknown, riserva: [number, number]): [number, number] {
  if (!c) return riserva;
  if (Array.isArray(c)) return [c[0], c[1]];
  const ll = c as { lng: number; lat: number };
  return [ll.lng, ll.lat];
}

export function useTour({
  map,
  labelId,
  dati,
}: {
  map: MapHandle | null;
  labelId: string | undefined;
  dati: DatiTour;
}) {
  const [momento, setMomento] = useState<MomentoTour>("attesa");
  const [attiva, setAttiva] = useState(-1);
  /**
   * La tappa di cui parlano i pannelli.
   *
   * Non coincide con quella attiva: al via di un volo la tappa attiva cambia
   * subito — la barra dei capitoli deve dire dove si sta andando — mentre i
   * pannelli si stanno ancora spegnendo sulla storia precedente, e cambiargli
   * il contenuto in quel momento lo farebbe vedere mentre sfuma.
   */
  const [mostrata, setMostrata] = useState(-1);
  /** Cresce a ogni arrivo: serve a far ripartire l'avanzamento della sosta. */
  const [arrivi, setArrivi] = useState(0);
  const [inPausa, setInPausa] = useState(false);
  const [sipario, setSipario] = useState(true);
  /**
   * Quale dei due paesi si sta guardando: quello dell'apertura o quello del
   * ritorno. Dicono due cose diverse, e il titolo non deve cambiare mentre
   * sfuma solo perche' il giro e' ripartito.
   */
  const [paeseDi, setPaeseDi] = useState<"apertura" | "ritorno">("apertura");
  const [prefetchMs, setPrefetchMs] = useState<number | null>(null);

  const pausa = useRef(false);
  const stato = useRef<Stato>({ ...INIZIALE });
  const misure = useRef<Misure | null>(null);
  const overlay = useRef<MapLibreOverlay | null>(null);
  const corsa = useRef(0);
  /** La mappa su cui il giro e' partito: una mappa nuova lo fa ripartire. */
  const avviata = useRef<MapHandle | null>(null);
  const mondo = useMemo(() => costruisciGlobo(), []);

  const { celle, tappe, punti } = dati;

  /**
   * Tutto quello che finisce in `data` e' preparato qui, una volta.
   *
   * Il disegno ricompone gli strati a ogni fotogramma, e deck.gl confronta i
   * dati per identita': un vettore nuovo — anche identico, anche vuoto — vale
   * come un dato cambiato, e per le celle vorrebbe dire rifare la
   * triangolazione di seicento esagoni sessanta volte al secondo.
   */
  const celleNumerate = useMemo(() => celle.map((c, i) => ({ ...c, i })), [celle]);
  const perTappa = useMemo(
    () =>
      tappe.map((t) => ({
        sottoModello: t.negozi.filter((n) => n.sottoModello),
        /**
         * I tre negozi con piu' potenziale, con un nome.
         *
         * Una colonna senza nome e' un'astrazione; «Walgreens, Sugar Land» e'
         * un negozio che qualcuno in sala ha visitato. Tre e non tutti: le
         * etichette sono una prova che i dati sono veri, non un elenco da
         * leggere.
         */
        piuAlti: t.negozi
          .filter((n) => n.potenziale > 0)
          .sort((a, b) => b.potenziale - a.potenziale || a.onda - b.onda)
          .slice(0, 3)
          .map((n) => ({ ...n, testo: `${n.nome} · ${valuta(n.potenziale)}` })),
        /**
         * I contorni delle celle della storia, in coordinate proiettate.
         *
         * L'onda d'arrivo si allarga da li': scalarli nella proiezione, e non
         * in gradi, e' quello che li tiene esagoni regolari a qualunque
         * latitudine — in gradi, a quaranta gradi nord, si schiaccerebbero di
         * un quarto.
         */
        esagoni: t.locale
          ? t.bordi.map((anello) => {
              const vertici = anello.map(([lng, lat]) => mercatore(lng, lat));
              const n = vertici.length - 1;
              const cx = vertici.slice(0, n).reduce((a, v) => a + v[0], 0) / n;
              const cy = vertici.slice(0, n).reduce((a, v) => a + v[1], 0) / n;
              return { cx, cy, vertici };
            })
          : [],
      })),
    [tappe],
  );

  useEffect(() => {
    pausa.current = inPausa;
  }, [inPausa]);

  /* ------------------------------------------------------------ il disegno */

  const disegna = useCallback(
    (ora: number) => {
      const o = overlay.current;
      const mis = misure.current;
      if (!o) return;
      const s = stato.current;
      const tappa = s.fuoco >= 0 ? tappe[s.fuoco] : null;
      const misTappa = mis && s.fuoco >= 0 ? mis.tappe[s.fuoco] : null;
      const altezzaCelle = mis?.altezzaCelle ?? 400_000;

      /**
       * L'onda del rilievo: ogni cella si alza nel proprio turno, da ovest a
       * est. Il ritmo e' la posizione in classifica, non la longitudine, per
       * la stessa ragione delle colonne di T12: altrimenti la costa est si
       * alzerebbe tutta insieme.
       */
      const salita = (c: CellaTour) => dolce(limita((s.rilievo - c.onda * 0.6) / 0.4));
      const eDellaTappa = (i: number) => tappa?.celle.has(i) ?? false;

      // Le celle a terra, sotto i negozi, restano leggibili ma si fanno da
      // parte: da vicino il dato sono i negozi, la cella e' il posto.
      const alfaCella = (i: number) => {
        const sua = eDellaTappa(i);
        const spenta = sua ? 1 : 1 - 0.8 * s.messaFuoco;
        const pavimento = 1 - (sua ? 0.84 : 0.8) * (1 - s.alzate);
        return 255 * spenta * pavimento;
      };

      const coloreCella = (c: CellaTour & { i: number }): [number, number, number, number] => {
        const col = coloreValore(Math.sqrt(c.valore));
        return [col[0], col[1], col[2], alfaCella(c.i) * Math.min(1, s.rilievo * 3)];
      };

      /**
       * Nessuna colonna e' piu' bassa di tre pixel.
       *
       * Una cella con un potenziale quasi nullo ha la faccia superiore a quota
       * zero, cioe' esattamente sulla superficie del globo, e due superfici
       * che coincidono lampeggiano: la scheda video decide pixel per pixel,
       * fotogramma per fotogramma, quale sta sopra, e la cella si riempie di
       * macchie. Alle colonne il confronto di profondita' non si puo' togliere
       * — serve perche' si coprano a vicenda — quindi le si stacca da terra.
       *
       * Il minimo e' in pixel e non in metri per la stessa ragione dei negozi:
       * tre pixel sul paese sono quindici chilometri, su una citta' duecento
       * metri. Si arrotonda perche' non cambi a ogni fotogramma quando la
       * camera e' ferma, e con lui il ricalcolo di seicento altezze.
       */
      const vistaDeck = (o as unknown as { _deck?: { getViewports: () => VistaDeck[] } })._deck
        ?.getViewports()[0];
      const minimoGrezzo = vistaDeck ? 3 * metriPerPixel(vistaDeck.zoom, 38) : 15_000;
      const cifre = 10 ** Math.floor(Math.log10(minimoGrezzo));
      const minimoCella = Math.round(minimoGrezzo / cifre) * cifre;

      const tempoArrivo = (ora - s.arrivo) / 1000;
      const strati: Layer[] = [
        new PolygonLayer<CellaTour & { i: number }>({
          id: "celle",
          data: celleNumerate,
          extruded: true,
          wireframe: false,
          getPolygon: (c) => c.anello,
          /**
           * L'altezza e' la **radice** del potenziale, non il potenziale.
           *
           * Su questo dataset la cella mediana vale il 2% di quella al tetto:
           * in scala lineare il paese e' una pianura con venti guglie, e la
           * forma degli Stati Uniti — che e' la prima cosa che la sala deve
           * riconoscere — sparisce. La radice conserva l'ordine e comprime gli
           * estremi; il colore resta a dire da che parte della scala si sta.
           */
          getElevation: (c) =>
            Math.max(minimoCella, Math.sqrt(c.altezza) * altezzaCelle * salita(c) * s.alzate),
          getFillColor: coloreCella,
          visible: s.alzate > 0.01,
          updateTriggers: {
            getElevation: [s.rilievo, s.alzate, minimoCella],
            getFillColor: [s.rilievo, s.alzate, s.messaFuoco, s.fuoco],
          },
          ...under(labelId),
        }),

        /**
         * Le stesse celle, a terra: un pavimento **non estruso**.
         *
         * Un prisma alto zero non e' un pavimento: la faccia superiore e quella
         * inferiore coincidono, e da lontano la profondita' non basta a
         * separarle — le celle si riempiono di strisce. Sotto una certa altezza
         * si passa quindi a un poligono piatto, che ha una faccia sola.
         * Esiste fin dall'inizio, come tutti gli strati, perche' il primo
         * disegno non cada a meta' di un volo.
         */
        new PolygonLayer<CellaTour & { i: number }>({
          id: "pavimento",
          parameters: A_TERRA,
          data: celleNumerate,
          extruded: false,
          stroked: false,
          getPolygon: (c) => c.anello,
          getFillColor: coloreCella,
          visible: s.alzate <= 0.01,
          updateTriggers: { getFillColor: [s.rilievo, s.alzate, s.messaFuoco, s.fuoco] },
          ...under(labelId),
        }),

        new ScatterplotLayer<[number, number]>({
          id: "punti",
          parameters: A_TERRA,
          data: punti,
          radiusUnits: "pixels",
          getRadius: 2.2,
          getPosition: (p) => p,
          getFillColor: [230, 236, 245, 255],
          // Contesto, non dato: tutti i negozi del paese come polvere sul
          // terreno, visibili solo quando le celle sono diventate pavimento.
          opacity: 0.32 * (1 - s.alzate),
          visible: s.alzate < 0.98,
          ...under(labelId),
        }),

        new PathLayer<[number, number][]>({
          id: "bordi",
          parameters: A_TERRA,
          data: tappa?.locale ? tappa.bordi : VUOTO,
          getPath: (b) => b,
          getColor: [...ACCENTO, 255],
          widthUnits: "pixels",
          getWidth: 5,
          opacity: s.apertura,
          ...under(labelId),
        }),

        /**
         * L'anello di riferimento: la concorrenza del negozio **tipico**.
         *
         * Da solo, un anello colorato non dice se e' grande o piccolo. Con
         * accanto quello del negozio mediano la lettura e' immediata: sotto
         * assedio il colore esce dal bianco, in campo libero ci resta dentro.
         */
        new ScatterplotLayer<NegozioTour>({
          id: "anelli-mediana",
          parameters: A_TERRA,
          data:
            tappa?.storia.regia.strato === "concorrenti" && misTappa ? tappa.negozi : VUOTO,
          getPosition: (n) => n.position,
          getRadius: misTappa?.anello ?? 1,
          radiusScale: dolce(s.strato),
          stroked: true,
          filled: false,
          getLineColor: [255, 255, 255, 110],
          lineWidthUnits: "pixels",
          getLineWidth: 2,
          opacity: s.strato,
          updateTriggers: { getRadius: s.fuoco },
          ...under(labelId),
        }),

        new ScatterplotLayer<NegozioTour>({
          id: "anelli",
          parameters: A_TERRA,
          data:
            tappa?.storia.regia.strato === "concorrenti" && misTappa ? tappa.negozi : VUOTO,
          getPosition: (n) => n.position,
          // Il raggio cresce con la **radice** della concorrenza: e' un'area
          // che si guarda, e un anello a raggio proporzionale farebbe sembrare
          // quattro volte piu' affollato un posto che lo e' il doppio.
          getRadius: (n) => (misTappa?.anello ?? 1) * Math.sqrt(Math.max(0.05, n.concorrenza)),
          radiusScale: dolce(s.strato),
          stroked: true,
          filled: true,
          getFillColor: (tappa?.storia.archetipo === "sottoAssedio"
            ? [...ROSSO, 26]
            : [...ACQUA, 20]) as [number, number, number, number],
          getLineColor: (tappa?.storia.archetipo === "sottoAssedio"
            ? [...ROSSO, 210]
            : [...ACQUA, 210]) as [number, number, number, number],
          lineWidthUnits: "pixels",
          getLineWidth: 3,
          opacity: s.strato,
          updateTriggers: { getRadius: s.fuoco, getFillColor: s.fuoco, getLineColor: s.fuoco },
          ...under(labelId),
        }),

        new ColumnLayer<NegozioTour>({
          id: "negozi",
          data: tappa?.locale && misTappa ? tappa.negozi : VUOTO,
          diskResolution: 12,
          radius: misTappa?.raggio ?? 500,
          extruded: true,
          getPosition: (n) => n.position,
          getElevation: (n) => {
            const locale = dolce(limita((s.apertura - n.onda * 0.5) / 0.5));
            return (0.08 + Math.sqrt(n.valore) * 0.92) * (misTappa?.altezza ?? 1) * locale;
          },
          getFillColor: (n) => {
            const locale = limita((s.apertura - n.onda * 0.5) / 0.5);
            if (tappa?.storia.regia.strato === "modello") {
              // Sotto il modello: rosso. Gli altri si fanno grigi man mano che
              // lo strato si accende, cosi' il colore dice una cosa sola.
              const c = n.sottoModello
                ? ROSSO
                : ([
                    120 + 110 * (1 - s.strato),
                    130 + 100 * (1 - s.strato),
                    150 + 80 * (1 - s.strato),
                  ] as [number, number, number]);
              return [c[0], c[1], c[2], 255 * locale];
            }
            const c = coloreValore(Math.sqrt(n.valore));
            return [c[0], c[1], c[2], 255 * locale];
          },
          updateTriggers: {
            getElevation: [s.apertura, s.fuoco],
            getFillColor: [s.apertura, s.strato, s.fuoco],
          },
          // Sopra le etichette della mappa, non sotto: da vicino i nomi delle
          // citta' finivano stampati sulle colonne e le coprivano. Cosi' le
          // colonne nascondono i nomi che hanno davanti, e il resto si legge
          // sul terreno.
        }),


        new ScatterplotLayer<NegozioTour>({
          id: "modello",
          parameters: A_TERRA,
          data:
            tappa?.storia.regia.strato === "modello" ? perTappa[s.fuoco].sottoModello : VUOTO,
          getPosition: (n) => n.position,
          radiusUnits: "pixels",
          getRadius: 1,
          // L'impulso e' uniforme per tutto lo strato: cambia a ogni
          // fotogramma senza ricalcolare nessun attributo.
          radiusScale: 20 + 8 * Math.sin(ora / 260),
          stroked: true,
          filled: false,
          getLineColor: [...ROSSO, 230],
          lineWidthUnits: "pixels",
          getLineWidth: 3,
          opacity: s.strato,
          ...under(labelId),
        }),

        /**
         * L'onda d'arrivo: il contorno della cella che si allarga e svanisce.
         *
         * Non misura niente, dice solo «qui». Per questo ha la forma dell'area
         * di cui si parla e non quella di un cerchio: un anello rotondo attorno
         * a un esagono era una seconda geometria da interpretare, in un momento
         * in cui la sala deve capire soltanto dove si e' arrivati.
         */
        ...[0, 0.55].map((ritardo) => {
          const p = limita((tempoArrivo - ritardo) / 1.8);
          const attiva = Boolean(tappa?.locale) && tempoArrivo > ritardo && p < 1;
          const scala = 1 + 0.75 * dolce(p);
          return new PathLayer<[number, number][]>({
            id: `impulso-${ritardo}`,
            parameters: A_TERRA,
            data: attiva
              ? perTappa[s.fuoco].esagoni.map(({ cx, cy, vertici }) =>
                  vertici.map(([x, y]) => daMercatore(cx + (x - cx) * scala, cy + (y - cy) * scala)),
                )
              : VUOTO,
            getPath: (b) => b,
            getColor: [...ACCENTO, 255],
            widthUnits: "pixels",
            getWidth: 4,
            jointRounded: true,
            opacity: 1 - p,
            visible: attiva,
            ...under(labelId),
          });
        }),

        new ColumnLayer<NodoGlobo>({
          id: "globo-nodi",
          data: s.globo > 0.002 ? mondo.nodi : VUOTO,
          diskResolution: 6,
          radius: 190_000,
          extruded: true,
          getPosition: (n) => n.position,
          getElevation: (n) => (n.hub ? 520_000 : 170_000) * s.globo,
          getFillColor: (n) => {
            if (n.hub) return [...ACQUA, 235 * s.globo];
            const c = coloreValore(n.valore);
            return [c[0], c[1], c[2], c[3] * s.globo];
          },
          updateTriggers: { getElevation: s.globo, getFillColor: s.globo },
        }),

        new TripsLayer<ArcoGlobo>({
          id: "globo-archi",
          data: s.globo <= 0.002 && s.giroGlobo >= 0.999 ? VUOTO : mondo.archi,
          getPath: (a) => a.path,
          getTimestamps: (a) => a.timestamps,
          getColor: [238, 244, 250, 225 * s.globo],
          widthUnits: "pixels",
          getWidth: 3,
          fadeTrail: false,
          trailLength: mondo.fine * 1.05,
          currentTime: s.giroGlobo * mondo.fine - 2,
          updateTriggers: { getColor: s.globo },
        }),
      ];

      o.setProps({ layers: strati, effects: [LUCE] });
    },
    [celleNumerate, perTappa, tappe, punti, mondo, labelId],
  );

  useEffect(() => {
    if (!map) return;
    const o = new MapLibreOverlay({ interleaved: true, layers: [], effects: [LUCE] });
    map.addControl(o);
    overlay.current = o;

    /**
     * Il cielo, solo per le viste inclinate.
     *
     * Con la camera inclinata l'orizzonte entra nell'inquadratura, e sul nero
     * pieno il bordo della mappa si legge come un taglio. Una fascia blu lo fa
     * leggere come un orizzonte.
     *
     * **L'atmosfera invece resta spenta.** In MapLibre non e' un alone attorno
     * al pianeta ma un'ombreggiatura giorno-notte legata alla posizione della
     * luce: provata, sbianca mezzo globo di azzurro e cancella il paese che la
     * sala deve riconoscere.
     */
    try {
      map.setSky({
        "sky-color": "#0a1a3a",
        "horizon-color": "#2a4f8f",
        "fog-color": "#05070b",
        "sky-horizon-blend": 0.6,
        "horizon-fog-blend": 0.6,
        "fog-ground-blend": 0.9,
        "atmosphere-blend": 0,
      });
    } catch {
      // Uno stile che non accetta il cielo non e' un motivo per non partire.
    }

    let raf = 0;
    let rimossa = false;
    const giro = (ora: number) => {
      disegna(ora);
      raf = requestAnimationFrame(giro);
    };
    raf = requestAnimationFrame(giro);

    /**
     * La mappa puo' sparire sotto i piedi del giro.
     *
     * Succede ogni volta che MapSurface la ricrea — un ricaricamento a caldo in
     * sviluppo, uno smontaggio della pagina — e l'ordine delle pulizie di React
     * non garantisce che questo effetto si chiuda prima: il ciclo di disegno
     * chiamerebbe deck.gl su una mappa gia' distrutta, e un volo a meta'
     * continuerebbe a chiederle inquadrature. Alla rimozione si ferma tutto
     * subito: il disegno, e qualunque attesa in corso, che al passo successivo
     * scopre di non essere piu' l'ultima e si ritira.
     */
    const suRimozione = () => {
      rimossa = true;
      cancelAnimationFrame(raf);
      overlay.current = null;
      corsa.current++;
    };
    map.on("remove", suRimozione);

    return () => {
      cancelAnimationFrame(raf);
      overlay.current = null;
      map.off("remove", suRimozione);
      if (!rimossa) map.removeControl(o);
    };
  }, [map, disegna]);

  /* ---------------------------------------------------------- le attese */

  const anima = useCallback(
    (ms: number, passo: (t: number) => void, viva: () => boolean) =>
      new Promise<boolean>((risolvi) => {
        const inizio = performance.now();
        const f = (ora: number) => {
          if (!viva()) return risolvi(false);
          const t = Math.min(1, (ora - inizio) / ms);
          passo(t);
          if (t >= 1) return risolvi(true);
          requestAnimationFrame(f);
        };
        requestAnimationFrame(f);
      }),
    [],
  );

  /**
   * Un'attesa che si ferma con la pausa.
   *
   * Il tempo conta solo quando il giro non e' in pausa: chi presenta si ferma
   * su una storia per rispondere a una domanda, e quando riparte la sosta
   * riprende da dove era rimasta invece di passare subito alla successiva.
   */
  const sosta = useCallback(
    (ms: number, viva: () => boolean, aOgniPasso?: (trascorsi: number) => void) =>
      new Promise<boolean>((risolvi) => {
        let trascorsi = 0;
        let prima = performance.now();
        const f = (ora: number) => {
          if (!viva()) return risolvi(false);
          if (!pausa.current) trascorsi += ora - prima;
          prima = ora;
          aOgniPasso?.(trascorsi);
          if (trascorsi >= ms) return risolvi(true);
          requestAnimationFrame(f);
        };
        requestAnimationFrame(f);
      }),
    [],
  );

  /** Porta lo stato verso dei valori di arrivo, dai valori attuali. */
  const porta = useCallback(
    (ms: number, arrivo: Partial<Stato>, viva: () => boolean, guida?: () => number) => {
      const da = { ...stato.current };
      const chiavi = Object.keys(arrivo) as (keyof Stato)[];
      return anima(
        ms,
        (t) => {
          const p = guida ? guida() : dolce(t);
          for (const k of chiavi) {
            const a = arrivo[k] as number;
            (stato.current[k] as number) = da[k] + (a - da[k]) * p;
          }
        },
        viva,
      );
    },
    [anima],
  );

  const calcolaMisure = useCallback(
    (m: MapHandle): Misure => {
      const vistaDi = (
        riquadro: [[number, number], [number, number]],
        padding: typeof MARGINI_LUOGO,
        pitch: number,
        maxZoom: number,
      ): Vista => {
        const c = m.cameraForBounds(riquadro, { padding, pitch, bearing: 0, maxZoom });
        const centro: [number, number] = [
          (riquadro[0][0] + riquadro[1][0]) / 2,
          (riquadro[0][1] + riquadro[1][1]) / 2,
        ];
        return { center: centroDi(c?.center, centro), zoom: c?.zoom ?? 4, pitch, bearing: 0 };
      };

      // La mappa calcola l'inquadratura come se la camera fosse a picco:
      // inclinata, il paese si allontana e resta un terzo del muro vuoto sotto.
      // Il mezzo livello in piu' lo riporta a riempire l'altezza.
      const aPicco = vistaDi(BORDI_PAESE, MARGINI_PAESE, PITCH_PAESE, 6);
      const paese = { ...aPicco, zoom: aPicco.zoom + 0.35 };
      const mppPaese = metriPerPixel(paese.zoom, paese.center[1]);

      return {
        paese,
        // Le celle piu' alte arrivano a un sesto dell'altezza del muro: con
        // l'inclinazione e la curvatura del globo, di piu' copre il paese.
        altezzaCelle: 170 * mppPaese,
        tappe: tappe.map((t) => {
          const vista = t.locale
            ? vistaDi(t.riquadro, MARGINI_LUOGO, PITCH_LUOGO, 11.5)
            : vistaDi(t.riquadro, MARGINI_PAESE_STORIA, PITCH_PAESE, 6);
          const mpp = metriPerPixel(vista.zoom, vista.center[1]);
          return {
            vista,
            raggio: 10 * mpp,
            altezza: 420 * mpp,
            anello: 30 * mpp,
          };
        }),
      };
    },
    [tappe],
  );

  /* ------------------------------------------------------------ il giro */

  const vaiRef = useRef<(i: number) => void>(() => {});
  const ritornoRef = useRef<() => void>(() => {});

  const vai = useCallback(
    async (indice: number) => {
      const m = map;
      const mis = misure.current;
      if (!m || !mis || !tappe.length) return;
      const i = ((indice % tappe.length) + tappe.length) % tappe.length;
      const mia = ++corsa.current;
      const viva = () => corsa.current === mia;
      const tappa = tappe[i];
      const { vista } = mis.tappe[i];

      setMomento("volo");
      setAttiva(i);

      // Prima si chiude quello che c'era: i negozi rientrano nel terreno,
      // lo strato si spegne. Rapido, perche' e' un'uscita e non un racconto.
      await porta(500, { apertura: 0, strato: 0 }, viva);
      if (!viva()) return;
      stato.current.fuoco = i;

      /**
       * Dal paese a un luogo, il rilievo scende **prima** che la camera parta.
       *
       * Dal paese il volo non si allontana: scende e basta, e lo fa subito. Le
       * celle che si abbassano durante la discesa venivano attraversate dalla
       * camera — per un secondo il muro era una foresta di prismi che le
       * passava accanto. Abbassandole a camera ferma si legge un gesto
       * preciso: il paese si fa pavimento, poi si scende sul posto.
       */
      if (tappa.locale && stato.current.alzate > 0.5) {
        await porta(1100, { alzate: 0, messaFuoco: 1 }, viva);
        if (!viva()) return;
      }

      const da: [number, number] = [m.getCenter().lng, m.getCenter().lat];
      const km =
        Math.hypot(
          (vista.center[0] - da[0]) * Math.cos((da[1] * Math.PI) / 180),
          vista.center[1] - da[1],
        ) * 111;
      const durata = Math.round(Math.min(7000, 3800 + km * 1.4 + Math.abs(vista.zoom - m.getZoom()) * 250));
      m.flyTo({ ...vista, duration: durata, curve: 1.5, essential: true });

      /**
       * Le celle si abbassano **nella prima parte del volo**, a tempo.
       *
       * Legarle allo zoom sembrava la scelta naturale, ma il volo di MapLibre
       * prima si allontana e poi scende: seguendo lo zoom le celle restavano
       * alte fino all'ultimo, e la camera finiva dentro la colonna della cella
       * di arrivo — un muro giallo a tutto schermo. Abbassandole mentre la
       * camera si alza, quando si scende il terreno e' gia' un pavimento.
       *
       * Al contrario, tornando sul paese si alzano seguendo lo zoom: li' il
       * volo si allontana e basta, e il rilievo cresce con la distanza.
       */
      const z0 = m.getZoom();
      const arcoZoom = vista.zoom - z0;
      const da0 = { ...stato.current };
      const verso = tappa.locale ? 0 : 1;
      await anima(
        durata,
        (t) => {
          const s = stato.current;
          const p = tappa.locale
            ? dolce(limita(t / 0.3))
            : Math.abs(arcoZoom) > 1
              ? limita((m.getZoom() - z0) / arcoZoom)
              : dolce(t);
          s.alzate = da0.alzate + (verso - da0.alzate) * p;
          s.messaFuoco = da0.messaFuoco + (1 - da0.messaFuoco) * dolce(limita(t / 0.5));
          s.rilievo = da0.rilievo + (1 - da0.rilievo) * dolce(t);
        },
        viva,
      );
      if (!viva()) return;

      stato.current.arrivo = performance.now();
      setMostrata(i);
      setMomento("tappa");
      setArrivi((n) => n + 1);

      await porta(1500, { apertura: 1 }, viva, undefined);
      if (!viva()) return;
      void porta(1100, { strato: 1 }, viva);

      /**
       * Una rotazione lenta durante la sosta.
       *
       * Una camera ferma su un rilievo per dodici secondi si legge come una
       * fotografia; una deriva di pochi gradi fa leggere i volumi senza
       * diventare un movimento da seguire. Sul paese no: un paese che ruota
       * smette di essere riconoscibile.
       */
      const b0 = m.getBearing();
      const completa = await sosta(SOSTA_MS - 1500, viva, (ms) => {
        if (tappa.locale) m.jumpTo({ bearing: b0 + (ms / 1000) * 0.9 });
      });
      if (!completa || !viva()) return;

      if (i + 1 < tappe.length) vaiRef.current(i + 1);
      else ritornoRef.current();
    },
    [map, tappe, porta, sosta, anima],
  );

  /** Il ritorno al paese: la chiusura del giro, poi di nuovo dall'inizio. */
  const ritorno = useCallback(async () => {
    const m = map;
    const mis = misure.current;
    if (!m || !mis) return;
    const mia = ++corsa.current;
    const viva = () => corsa.current === mia;

    setMomento("volo");
    setAttiva(-1);
    await porta(500, { apertura: 0, strato: 0 }, viva);
    if (!viva()) return;

    const z0 = m.getZoom();
    const arco = mis.paese.zoom - z0;
    m.flyTo({ ...mis.paese, duration: 5000, curve: 1.4, essential: true });
    await porta(
      5000,
      { alzate: 1, messaFuoco: 0 },
      viva,
      Math.abs(arco) > 1 ? () => limita((m.getZoom() - z0) / arco) : undefined,
    );
    if (!viva()) return;
    stato.current.fuoco = -1;
    setPaeseDi("ritorno");
    setMomento("ritorno");

    if (!(await sosta(SOSTA_PAESE_MS + 2000, viva))) return;
    vaiRef.current(0);
  }, [map, porta, sosta]);

  useEffect(() => {
    vaiRef.current = (i) => void vai(i);
    ritornoRef.current = () => void ritorno();
  }, [vai, ritorno]);

  /* --------------------------------------------------------- l'apertura */

  const riparti = useCallback(async () => {
    const m = map;
    if (!m) return;
    const mia = ++corsa.current;
    const viva = () => corsa.current === mia;

    setMomento("preparazione");
    setAttiva(-1);
    setSipario(true);
    setPaeseDi("apertura");
    stato.current = { ...INIZIALE };

    const mis = misure.current ?? calcolaMisure(m);
    misure.current = mis;
    const centro = mis.paese.center;

    // `?tappa=N`: vedi sotto. Per una prova non si aspetta il precaricamento.
    const salta = Number(new URLSearchParams(window.location.search).get("tappa"));
    const prova = salta >= 1 && salta <= tappe.length;

    // Il precaricamento percorre anche le otto tappe: sono inquadrature che il
    // volo raggiunge a camera ferma, e una tessera che arriva mentre la sala
    // guarda un negozio e' il difetto piu' visibile di tutta la scena.
    const rapporto = prova
      ? { durationMs: 0 }
      : await prefetchDescent(m, {
      center: centro,
      tappe: [
        { center: [centro[0] + 70, 22], zoom: ZOOM_GLOBO, pitch: 0 },
        { center: mis.paese.center, zoom: mis.paese.zoom, pitch: mis.paese.pitch },
        ...mis.tappe.map((t) => ({ center: t.vista.center, zoom: t.vista.zoom, pitch: t.vista.pitch })),
      ],
      fromZoom: START_ZOOM,
      toZoom: mis.paese.zoom,
      toPitch: PITCH_PAESE,
      // Pochi passi e un limite stretto: il corridoio fino al paese si carica in
      // fretta, e sono le tappe — dodici livelli piu' in basso — a pesare.
      steps: 4,
      stepTimeoutMs: 2500,
    });
    if (!viva()) return;
    setPrefetchMs(rapporto.durationMs);

    /**
     * `?tappa=N` salta l'apertura e parte dalla storia N.
     *
     * Per le prove: chi prepara la presentazione vuole rivedere la quinta
     * storia senza guardare ogni volta il globo girare.
     */
    if (salta >= 1 && salta <= tappe.length) {
      m.jumpTo(mis.paese);
      stato.current.rilievo = 1;
      stato.current.alone = 1;
      setSipario(false);
      vaiRef.current(salta - 1);
      return;
    }

    const GIRO = 70;
    m.jumpTo({ center: [centro[0] + GIRO, 22], zoom: ZOOM_GLOBO, pitch: 0, bearing: 0 });
    await settle(m, 3000);
    if (!viva()) return;

    setMomento("globo");
    setSipario(false);
    await anima(
      7000,
      (t) => {
        const avanzamento = 1 - (1 - t) ** 2;
        m.jumpTo({
          center: [centro[0] + GIRO * (1 - avanzamento), 22 + (centro[1] - 22) * avanzamento],
          zoom: ZOOM_GLOBO,
          pitch: 0,
          bearing: 0,
        });
        stato.current.globo = Math.min(1, t / 0.12);
        stato.current.giroGlobo = Math.min(1, t / 0.85);
        // L'alone entra con calma, in tre secondi: acceso di colpo insieme al
        // globo era la prima cosa che si notava, prima ancora del pianeta.
        stato.current.alone = dolce(Math.min(1, t / 0.42));
      },
      viva,
    );
    if (!viva()) return;

    setMomento("discesa");
    m.flyTo({ ...mis.paese, duration: 3400, essential: true });
    await anima(
      3400,
      (t) => {
        stato.current.globo = Math.max(0, 1 - t / 0.5);
      },
      viva,
    );
    if (!viva()) return;

    setMomento("paese");
    await anima(3200, (t) => (stato.current.rilievo = t), viva);
    if (!viva()) return;
    if (!(await sosta(SOSTA_PAESE_MS, viva))) return;
    vaiRef.current(0);
  }, [map, anima, sosta, calcolaMisure, tappe.length]);

  useEffect(() => {
    if (!map || avviata.current === map) return;
    avviata.current = map;
    // Le inquadrature appartengono alla mappa che le ha calcolate.
    misure.current = null;
    void riparti();
  }, [map, riparti]);

  /**
   * Il bordo del globo sullo schermo, e quanto deve essere acceso l'alone.
   *
   * L'alone e' SVG e non uno strato di deck.gl, per la stessa ragione delle
   * etichette: tre linee sul bordo, disegnate da deck.gl in coda alla mappa,
   * non comparivano da nessuna parte — nemmeno spostate ben dentro il disco.
   * La proiezione invece e' esatta, ed e' tutto quello che serve.
   *
   * Si spegne scendendo di quota: da vicino il bordo e' l'orizzonte, e li' la
   * fascia la disegna gia' il cielo della mappa.
   */
  const bordoGlobo = useCallback((): { punti: [number, number][]; intensita: number } | null => {
    const s = stato.current;
    const o = overlay.current as unknown as {
      _deck?: { getViewports: () => (VistaDeck & { project: (p: number[]) => number[] })[] };
    } | null;
    const vista = o?._deck?.getViewports()[0];
    if (!vista || s.alone <= 0.002) return null;
    const intensita = s.alone * limita((6.2 - vista.zoom) / 1.6);
    if (intensita <= 0.002) return null;
    const bordo = bordoDelGlobo(vista);
    if (!bordo) return null;
    return {
      intensita,
      punti: bordo.map(([lng, lat]) => {
        const [x, y] = vista.project([lng, lat, 0]);
        return [x, y];
      }),
    };
  }, []);

  /**
   * Dove cadono sullo schermo le etichette dei negozi, in questo fotogramma.
   *
   * Sono HTML e non uno strato di deck.gl: il TextLayer, sotto la vista a globo
   * con gli strati intrecciati alla mappa, non disegna niente — provato anche a
   * terra, senza confronto di profondita' e con l'atlante dei caratteri pronto.
   *
   * La proiezione la fa la vista di deck.gl e non la mappa, perche' e'
   * l'unica che tiene conto della quota: l'etichetta va in cima alla colonna,
   * e la cima di una colonna di quaranta chilometri sta duecento pixel sopra
   * il punto a terra che MapLibre saprebbe proiettare. La vista non e' esposta
   * dall'overlay, da qui l'accesso al campo interno, confinato in questo punto.
   */
  const etichette = useCallback((): {
    voci: { x: number; y: number; testo: string }[];
    opacita: number;
  } => {
    const s = stato.current;
    const mis = misure.current;
    const o = overlay.current as unknown as {
      _deck?: { getViewports: () => { project: (p: number[]) => number[] }[] };
    } | null;
    if (s.fuoco < 0 || !mis || !tappe[s.fuoco]?.locale || s.strato <= 0.002) {
      return { voci: [], opacita: 0 };
    }
    const vista = o?._deck?.getViewports()[0];
    if (!vista) return { voci: [], opacita: 0 };
    const altezza = mis.tappe[s.fuoco].altezza;
    return {
      opacita: s.strato,
      voci: perTappa[s.fuoco].piuAlti.map((n) => {
        const cima = (0.08 + Math.sqrt(n.valore) * 0.92) * altezza;
        const [x, y] = vista.project([n.position[0], n.position[1], cima]);
        return { x, y, testo: n.testo };
      }),
    };
  }, [tappe, perTappa]);

  const avanti = useCallback(() => {
    if (attiva + 1 >= tappe.length) void ritorno();
    else void vai(attiva + 1);
  }, [attiva, tappe.length, vai, ritorno]);

  const indietro = useCallback(() => {
    if (attiva <= 0) void ritorno();
    else void vai(attiva - 1);
  }, [attiva, vai, ritorno]);

  return {
    momento,
    attiva,
    mostrata,
    arrivi,
    inPausa,
    setInPausa,
    sipario,
    paeseDi,
    etichette,
    bordoGlobo,
    prefetchMs,
    vai: (i: number) => void vai(i),
    avanti,
    indietro,
    paese: () => void ritorno(),
    riparti: () => void riparti(),
  };
}
