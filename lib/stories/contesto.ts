/**
 * Quello che serve sapere del paese prima di poter dire che un'area e' strana.
 *
 * Ogni criterio e' un confronto con un riferimento nazionale — piu' concorrenti
 * della mediana, piu' negozi in calo della media, un bacino fatto diversamente
 * dal bacino tipico. Quei riferimenti si calcolano una volta e si passano in
 * giro: ricalcolarli dentro ogni archetipo costerebbe sette passate sul
 * dataset e, peggio, permetterebbe a due archetipi di usarne due versioni
 * leggermente diverse.
 */

import { aggregaInCelle, aggregaPerCampo, type Area, type Cella } from "../data/aggregate.ts";
import { raggioPerArea, rettangoloDi } from "../data/grid.ts";
import {
  aggrega,
  composizioneDi,
  composizioneMedia,
  mediana,
  quadrante,
  tuttiGliIndici,
  variazioneAnnua,
  type Quadrante,
  type Sintesi,
} from "../data/metrics.ts";
import type { Dataset, GruppoDemografico } from "../data/schema.ts";
import type { Configurazione, Unita } from "./tipi.ts";

const GRUPPI: GruppoDemografico[] = ["eta", "reddito", "istruzione", "etnia"];

export type Contesto = {
  d: Dataset;
  config: Configurazione;
  /** Le celle del rilievo: l'unita' su cui si calcolano quasi tutti i criteri. */
  unita: Unita[];
  /** Gli stati: il livello a cui la concentrazione ha senso (§3.3 g). */
  grossolane: Unita[];
  nazionale: Sintesi;
  concorrentiMediana: number;
  /** Quota P&G realizzata nel paese, come frazione. */
  quotaNazionale: number;
  quoteQuadranti: Record<Quadrante, number>;
  /**
   * La variazione annua del negozio tipico.
   *
   * Serve perche' un calo si giudica **rispetto al paese**, non in assoluto. Su
   * questo dataset la linea P&G arretra ovunque: mediana -21%, quattro negozi
   * su cinque in calo. Con una soglia assoluta l'archetipo dell'anno perduto
   * scatterebbe su meta' del paese e direbbe soltanto che e' stato un anno
   * brutto, che non e' una storia su un luogo.
   */
  variazioneTipica: number;
  /** Il profilo demografico del bacino tipico, quattro gruppi in fila. */
  profiloNazionale: number[];
  /** Il profilo di un'area, calcolato una volta sola per area. */
  profilo: (u: Unita) => number[];
};

/**
 * Il nome del luogo di un insieme di negozi.
 *
 * Si prende la citta' piu' rappresentata e si aggiunge lo stato, perche' negli
 * Stati Uniti le omonimie sono la norma e «Columbia» da solo non individua
 * niente. Se la citta' porta gia' lo stato nel nome — nel dataset capita — non
 * lo si ripete.
 */
export function nomeDominante(d: Dataset, indici: ArrayLike<number>): string {
  // Si contano le **coppie** citta'-stato, non le due cose separatamente.
  // Prendendo la citta' piu' rappresentata e lo stato di un negozio qualsiasi
  // si ottiene «Pittsburgh, Ohio»: la citta' viene dal gruppo dominante e lo
  // stato da un negozio che sta dall'altra parte del confine.
  const conteggi = new Map<number, number>();
  const CHIAVE = 100_000;
  for (let k = 0; k < indici.length; k++) {
    const citta = d.testi.citta.codici[indici[k]];
    const stato = d.testi.stato.codici[indici[k]];
    if (citta < 0) continue;
    const chiave = citta * CHIAVE + (stato + 1);
    conteggi.set(chiave, (conteggi.get(chiave) ?? 0) + 1);
  }

  let migliore = -1;
  let quante = -1;
  for (const [chiave, n] of conteggi) {
    // A parita' di conteggio vince la chiave piu' bassa: senza questo criterio
    // il nome dipenderebbe dall'ordine di scorrimento, e due calcoli sullo
    // stesso dataset potrebbero dare due nomi diversi.
    if (n > quante || (n === quante && chiave < migliore)) {
      migliore = chiave;
      quante = n;
    }
  }
  if (migliore < 0) return "area senza nome";

  const citta = d.testi.citta.valori[Math.floor(migliore / CHIAVE)];
  const codiceStato = (migliore % CHIAVE) - 1;
  const stato = codiceStato < 0 ? null : d.testi.stato.valori[codiceStato];
  // Nel dataset alcune citta' portano gia' lo stato nel nome, ma dopo una
  // virgola: «Kansas City» contiene «Kansas» senza essere in Kansas, quindi il
  // confronto va fatto sulla coda e non sulla presenza della stringa.
  if (!stato || citta.endsWith(`, ${stato}`)) return citta;
  return `${citta}, ${stato}`;
}

function daCella(d: Dataset, c: Cella): Unita {
  return {
    id: `cella:${c.chiave}`,
    nome: nomeDominante(d, c.indici),
    centro: c.centro,
    indici: c.indici,
    sintesi: c.sintesi,
    sottoSoglia: c.sottoSoglia,
  };
}

function daArea(a: Area, campo: string): Unita {
  return {
    id: `${campo}:${a.nome}`,
    nome: a.nome,
    centro: a.centro,
    indici: a.indici,
    sintesi: a.sintesi,
    sottoSoglia: a.sottoSoglia,
  };
}

export function costruisciContesto(d: Dataset, config: Configurazione): Contesto {
  const tutti = tuttiGliIndici(d);
  const riquadro = rettangoloDi({ lng: d.lng, lat: d.lat, indici: tutti });
  const raggio = raggioPerArea(riquadro.area, config.celleMassime);

  const unita = aggregaInCelle(d, tutti, raggio, { minimoNegozi: config.minimoNegozi })
    .map((c) => daCella(d, c))
    // Ordine stabile per chiave: le mappe conservano l'ordine di inserimento,
    // che dipende da come sono disposti i negozi nel file. Un ordinamento
    // esplicito rende il risultato indipendente da quel dettaglio.
    .sort((a, b) => (a.id < b.id ? -1 : 1));

  const grossolane = aggregaPerCampo(d, tutti, "stato", { minimoNegozi: config.minimoNegozi })
    .map((a) => daArea(a, "stato"))
    .sort((a, b) => (a.id < b.id ? -1 : 1));

  const concorrenti: number[] = [];
  const variazioni: number[] = [];
  const quadranti: Record<string, number> = {
    Top: 0,
    Bottom: 0,
    Overachieving: 0,
    Underachieving: 0,
  };
  for (let i = 0; i < d.conteggio; i++) {
    if (Number.isFinite(d.concorrenti[i])) concorrenti.push(d.concorrenti[i]);
    const v = variazioneAnnua(d, i);
    if (v !== null) variazioni.push(v);
    const q = quadrante(d, i);
    if (q) quadranti[q]++;
  }

  const nazionale = aggrega(d, tutti);
  const profiloNazionale = GRUPPI.flatMap((g) => composizioneMedia(d, g));
  const cache = new Map<string, number[]>();

  return {
    d,
    config,
    unita,
    grossolane,
    nazionale,
    concorrentiMediana: mediana(concorrenti) ?? 0,
    variazioneTipica: mediana(variazioni) ?? 0,
    quotaNazionale: nazionale.vendite > 0 ? nazionale.venditePg / nazionale.vendite : 0,
    quoteQuadranti: {
      Top: quadranti.Top / d.conteggio,
      Bottom: quadranti.Bottom / d.conteggio,
      Overachieving: quadranti.Overachieving / d.conteggio,
      Underachieving: quadranti.Underachieving / d.conteggio,
    },
    profiloNazionale,
    profilo(u) {
      const gia = cache.get(u.id);
      if (gia) return gia;
      const v = GRUPPI.flatMap((g) => composizioneDi(d, g, u.indici));
      cache.set(u.id, v);
      return v;
    },
  };
}

/**
 * Distanza fra due profili demografici, 0..1.
 *
 * E' la quota di popolazione che andrebbe spostata da una voce all'altra per
 * rendere i due profili identici, mediata sui quattro gruppi. Zero significa
 * bacini fatti allo stesso modo, uno significa nessuna sovrapposizione.
 */
export function distanzaDemografica(a: number[], b: number[]): number {
  let somma = 0;
  for (let i = 0; i < a.length; i++) somma += Math.abs(a[i] - b[i]);
  return somma / 2 / GRUPPI.length;
}

/** La quota P&G realizzata da un insieme di negozi. */
export function quotaDi(s: Sintesi): number {
  return s.vendite > 0 ? s.venditePg / s.vendite : 0;
}

/** Il valore al percentile dato, su valori non ordinati. */
export function percentile(valori: number[], p: number): number {
  if (!valori.length) return 0;
  const ordinati = [...valori].sort((a, b) => a - b);
  return ordinati[Math.max(0, Math.min(ordinati.length - 1, Math.floor(ordinati.length * p)))];
}
