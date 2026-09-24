/**
 * I dati del tour delle storie (T13).
 *
 * T12 si chiudeva su una stella della rete scelta per quanta merce muove, e
 * quella stella — Dallas, sei negozi, +21% — valeva esattamente la media del
 * paese: la scena faceva mezzo minuto di viaggio per arrivare in un posto
 * normale. Le storie del motore sono invece proprio l'elenco dei posti che non
 * lo sono, e ciascuna porta con se' la propria regia. Questo modulo le traduce
 * in qualcosa che la scena puo' disegnare: le celle del rilievo nazionale, e
 * per ogni tappa i negozi da far emergere e lo strato da accendere.
 *
 * Funzioni pure, come il motore: niente React e niente mappa. Il tour deve
 * essere deterministico quanto le storie da cui nasce, perche' chi lo prova il
 * giorno prima deve ritrovare lo stesso giro davanti alla sala.
 */

import { scalaAltezze } from "../data/aggregate.ts";
import { centroCella, daMercatore, raggioPerArea, rettangoloDi } from "../data/grid.ts";
import {
  composizioneDi,
  composizioneMedia,
  potenziale,
  quadrante,
  tuttiGliIndici,
  type Sintesi,
} from "../data/metrics.ts";
import type { Dataset, Glossario, GruppoDemografico } from "../data/schema.ts";
import type { Contesto } from "../stories/contesto.ts";
import { distanzaKm, type Storia } from "../stories/index.ts";

export type CellaTour = {
  /** L'anello dell'esagono, in gradi, chiuso, un filo piu' stretto della cella. */
  anello: [number, number][];
  /**
   * Il bordo vero della cella, a raggio pieno.
   *
   * Il contorno a terra non puo' usare l'anello ristretto: i negozi vicini al
   * bordo cadrebbero fuori dalla cella a cui appartengono, e la sala vedrebbe
   * una storia che non sta dentro il proprio confine.
   */
  bordo: [number, number][];
  centro: [number, number];
  /** Potenziale normalizzato sulla scala globale, 0..1. */
  valore: number;
  /** Zero per le celle sotto la soglia di negozi: restano a terra (§2.5). */
  altezza: number;
  /**
   * Quando la cella si alza nell'onda che attraversa il paese, 0..1.
   *
   * Da ovest verso est, per posizione in classifica e non per longitudine:
   * con la longitudine grezza la costa est, dove le celle sono fitte, si
   * alzerebbe tutta nello stesso istante.
   */
  onda: number;
};

export type NegozioTour = {
  position: [number, number];
  /** Potenziale normalizzato sulla scala dei negozi, 0..1. */
  valore: number;
  /** Ordine di comparsa dal centro verso fuori, 0..1. */
  onda: number;
  /** Concorrenti rispetto alla mediana nazionale: 1 = come il negozio tipico. */
  concorrenza: number;
  /** Vero per i negozi che il modello P&G classifica sotto le attese. */
  sottoModello: boolean;
  /** Il potenziale inespresso in dollari, per l'etichetta. */
  potenziale: number;
  /** L'insegna e la citta', gia' composte: «Walgreens, Sugar Land». */
  nome: string;
};

export type VoceProfilo = { etichetta: string; valore: number; riferimento: number };

export type Tappa = {
  storia: Storia;
  /**
   * Vero per le storie su un luogo; falso per quelle sul paese.
   *
   * La concentrazione parla di nove stati: si guarda dall'alto, non si scende,
   * e i suoi negozi non emergono uno per uno — sarebbero migliaia di colonne a
   * dire una cosa che il rilievo gia' dice.
   */
  locale: boolean;
  /** Le celle del rilievo che contengono almeno un negozio della storia. */
  celle: Set<number>;
  /** I bordi delle celle della storia, per il contorno a terra. */
  bordi: [number, number][][];
  negozi: NegozioTour[];
  /** Il rettangolo che la camera deve contenere. */
  riquadro: [[number, number], [number, number]];
  /**
   * Il gruppo demografico in cui l'area si allontana di piu' dal paese.
   *
   * Solo per le storie che accendono lo strato demografico: mostrare l'eta'
   * quando lo scarto sta nel reddito vorrebbe dire mostrare un grafico piatto
   * sotto una frase che promette una differenza.
   */
  profilo: { gruppo: GruppoDemografico; voci: VoceProfilo[] } | null;
};

export type DatiTour = {
  celle: CellaTour[];
  tappe: Tappa[];
  /** Tutti i negozi con coordinate, come punti di contesto nelle strette. */
  punti: [number, number][];
  nazionale: Sintesi;
  /** Il potenziale che le tappe locali raccontano, sommato. */
  potenzialeRaccontato: number;
};

const NOMI_GRUPPO: Record<GruppoDemografico, string> = {
  eta: "age",
  reddito: "income",
  istruzione: "education",
  etnia: "ethnicity",
};
export const nomeGruppo = (g: GruppoDemografico) => NOMI_GRUPPO[g];

export function costruisciTour(
  d: Dataset,
  storie: Storia[],
  ctx: Contesto,
  glossario: Glossario,
): DatiTour {
  /* ------------------------------------------------------------ le celle */

  // Lo stesso raggio che ha usato il contesto: le celle del tour sono quelle
  // su cui il motore ha calcolato le storie, non una seconda maglia simile.
  const tutti = tuttiGliIndici(d);
  const raggio = raggioPerArea(
    rettangoloDi({ lng: d.lng, lat: d.lat, indici: tutti }).area,
    ctx.config.celleMassime,
  );
  const scalaCelle = scalaAltezze(ctx.unita.map((u) => u.sintesi.potenziale));

  const cellaDelNegozio = new Int32Array(d.conteggio).fill(-1);
  const perLongitudine = ctx.unita
    .map((u, i) => ({ lng: u.centro[0], i }))
    .sort((a, b) => a.lng - b.lng || a.i - b.i);
  const onde = new Array<number>(ctx.unita.length);
  perLongitudine.forEach(({ i }, posizione) => {
    onde[i] = posizione / Math.max(1, perLongitudine.length - 1);
  });

  const celle: CellaTour[] = ctx.unita.map((u, i) => {
    for (let k = 0; k < u.indici.length; k++) cellaDelNegozio[u.indici[k]] = i;
    const chiave = Number(u.id.slice("cella:".length));
    const [cx, cy] = centroCella(chiave, raggio);
    // Un filo di distacco fra le celle: attaccate, a vista nazionale si
    // fondono in una superficie e il rilievo smette di leggersi come celle.
    const esagono = (r: number) => {
      const punti: [number, number][] = [];
      for (let v = 0; v <= 6; v++) {
        const a = ((v % 6) * Math.PI) / 3;
        punti.push(daMercatore(cx + r * Math.cos(a), cy + r * Math.sin(a)));
      }
      return punti;
    };
    const anello = esagono(raggio * 0.9);
    const valore = scalaCelle.normalizza(u.sintesi.potenziale);
    return {
      anello,
      bordo: esagono(raggio),
      centro: u.centro,
      valore,
      altezza: u.sottoSoglia ? 0 : valore,
      onda: onde[i],
    };
  });

  /* ------------------------------------------------------------ i negozi */

  const potenziali = new Float64Array(d.conteggio);
  for (let i = 0; i < d.conteggio; i++) potenziali[i] = potenziale(d, i) ?? 0;
  const scalaNegozi = scalaAltezze(Array.from(potenziali));
  const mediana = ctx.concorrentiMediana || 1;

  const punti: [number, number][] = [];
  for (let i = 0; i < d.conteggio; i++) {
    if (Number.isFinite(d.lng[i]) && Number.isFinite(d.lat[i])) punti.push([d.lng[i], d.lat[i]]);
  }

  /* ------------------------------------------------------------- le tappe */

  const tappe = ordina(storie).map((storia): Tappa => {
    const locale = storia.archetipo !== "concentrazione";
    const indici = storia.aree.flatMap((u) => Array.from(u.indici));

    const suoCelle = new Set<number>();
    for (const i of indici) if (cellaDelNegozio[i] >= 0) suoCelle.add(cellaDelNegozio[i]);

    const validi = indici.filter((i) => Number.isFinite(d.lng[i]) && Number.isFinite(d.lat[i]));
    const centro = storia.regia.centro;
    const perDistanza = validi
      .map((i) => ({ i, km: distanzaKm(centro, [d.lng[i], d.lat[i]]) }))
      .sort((a, b) => a.km - b.km || a.i - b.i);

    const negozi: NegozioTour[] = locale
      ? perDistanza.map(({ i }, posizione) => ({
          position: [d.lng[i], d.lat[i]],
          valore: scalaNegozi.normalizza(potenziali[i]),
          onda: posizione / Math.max(1, perDistanza.length - 1),
          concorrenza: Number.isFinite(d.concorrenti[i]) ? d.concorrenti[i] / mediana : 1,
          sottoModello: quadrante(d, i) === "Underachieving",
          potenziale: potenziali[i],
          nome: nomeNegozio(d, i),
        }))
      : [];

    const punteggiati = validi.map((i) => [d.lng[i], d.lat[i]] as [number, number]);

    return {
      storia,
      locale,
      celle: suoCelle,
      bordi: [...suoCelle].map((c) => celle[c].bordo),
      negozi,
      riquadro: riquadroTagliato(punteggiati, locale ? 0.02 : 0.01),
      profilo: storia.regia.strato === "demografia" ? profiloPiuDiverso(d, indici, glossario) : null,
    };
  });

  return {
    celle,
    tappe,
    punti,
    nazionale: ctx.nazionale,
    potenzialeRaccontato: tappe
      .filter((t) => t.locale)
      .reduce((s, t) => s + t.storia.sintesi.potenziale, 0),
  };
}

/**
 * Come si chiama un negozio sul muro: insegna e citta'.
 *
 * Il dataset scrive «0» dove l'insegna manca; in quel caso resta la citta',
 * che e' comunque quello che la sala riconosce.
 */
function nomeNegozio(d: Dataset, i: number): string {
  const testo = (campo: "insegna" | "citta") => {
    const codice = d.testi[campo].codici[i];
    const valore = codice >= 0 ? d.testi[campo].valori[codice] : "";
    return valore && valore !== "0" ? valore : "";
  };
  return [testo("insegna"), testo("citta")].filter(Boolean).join(", ") || "store";
}

/**
 * L'ordine del giro.
 *
 * **Prima la concentrazione**, perche' si guarda dalla stessa altezza da cui
 * si arriva: e' il ponte fra il paese intero e i luoghi. Poi i luoghi in
 * ordine di **vicinanza**, partendo dal piu' a ovest: l'ordine del motore e'
 * quello del punteggio, e seguito alla lettera farebbe attraversare il
 * continente avanti e indietro — sette voli lunghi dove ne bastano due o tre.
 * Il punteggio ha gia' fatto il suo lavoro scegliendo quali storie ci sono;
 * in che ordine raccontarle e' una questione di regia.
 */
function ordina(storie: Storia[]): Storia[] {
  const paese = storie.filter((s) => s.archetipo === "concentrazione");
  const restanti = storie.filter((s) => s.archetipo !== "concentrazione");
  if (!restanti.length) return paese;

  const giro: Storia[] = [];
  let corrente = restanti.reduce((a, b) =>
    a.regia.centro[0] < b.regia.centro[0] || (a.regia.centro[0] === b.regia.centro[0] && a.id < b.id)
      ? a
      : b,
  );
  const liberi = new Set(restanti);
  while (liberi.size) {
    liberi.delete(corrente);
    giro.push(corrente);
    let prossima: Storia | null = null;
    let minima = Infinity;
    for (const s of liberi) {
      const km = distanzaKm(corrente.regia.centro, s.regia.centro);
      if (km < minima || (km === minima && prossima && s.id < prossima.id)) {
        minima = km;
        prossima = s;
      }
    }
    if (!prossima) break;
    corrente = prossima;
  }
  return [...paese, ...giro];
}

/**
 * Il rettangolo dei negozi, senza gli isolati estremi.
 *
 * Lo stesso ragionamento della sequenza di T12: un punto solo puo' decidere
 * un'inquadratura, e nove stati che comprendono le Hawaii costringerebbero la
 * camera a inquadrare il Pacifico.
 */
function riquadroTagliato(
  punti: [number, number][],
  quota: number,
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

function profiloPiuDiverso(
  d: Dataset,
  indici: number[],
  glossario: Glossario,
): { gruppo: GruppoDemografico; voci: VoceProfilo[] } {
  const gruppi: GruppoDemografico[] = ["eta", "reddito", "istruzione", "etnia"];
  let migliore: { gruppo: GruppoDemografico; distanza: number; voci: VoceProfilo[] } | null = null;
  for (const gruppo of gruppi) {
    const media = composizioneMedia(d, gruppo);
    const locale = composizioneDi(d, gruppo, indici);
    const distanza = locale.reduce((s, v, i) => s + Math.abs(v - media[i]), 0) / 2;
    if (!migliore || distanza > migliore.distanza) {
      migliore = {
        gruppo,
        distanza,
        voci: d.demografia[gruppo].campi.map((campo, i) => ({
          etichetta: glossario.etichette[campo]?.etichetta ?? campo,
          valore: locale[i],
          riferimento: media[i],
        })),
      };
    }
  }
  return { gruppo: migliore!.gruppo, voci: migliore!.voci };
}
