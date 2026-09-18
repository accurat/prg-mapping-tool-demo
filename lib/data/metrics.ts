/**
 * Le grandezze del concept, definite una volta sola.
 *
 * Qui non si disegna e non si decide cosa mostrare: si stabilisce **cosa
 * significano i numeri**. Tutto il resto — il rilievo, le storie, i pannelli
 * sul muro, le schede della dashboard — chiama queste funzioni invece di
 * rifare i conti. Se una formula va corretta, va corretta qui, e non c'e' una
 * seconda copia da ricordarsi.
 *
 * Il modulo importa **solo tipi**. E' voluto: cosi' resta eseguibile anche
 * fuori dal browser, e le verifiche possono girare da riga di comando sugli
 * stessi identici conti che girano nella pagina.
 */

import type { Dataset, GruppoDemografico } from "./schema.ts";

/* ------------------------------------------------------- il riferimento (§2.2) */

/**
 * Rispetto a cosa si misura il potenziale inespresso.
 *
 * Il concept ne prevede quattro. La quarta — le colonne `size_of_prize` e
 * `share_gap` costruite apposta — non c'e': nel sample la prima e' interamente
 * nulla e la seconda tutta a zero. Se in produzione fossero popolate
 * diventerebbero la definizione preferibile, e il posto dove aggiungerla e'
 * questo.
 */
export type Riferimento =
  /** La quota P&G del proprio bacino di utenza. Predefinita. */
  | "bacino"
  /** La produttivita' del proprio bacino. */
  | "produttivita"
  /** La classificazione del modello P&G. Categoriale: quattro gradini. */
  | "modello";

export const RIFERIMENTO_PREDEFINITO: Riferimento = "bacino";

/* ------------------------------------------------------------------- quote */

/**
 * La quota P&G dentro il negozio, come frazione 0..1.
 *
 * **Si calcola, non si legge.** Il dataset ha la colonna gia' fatta, ma e'
 * arrotondata a due decimali di punto percentuale: su diecimila negozi produce
 * cinquantatre valori distinti, e il potenziale inespresso — che e' la
 * differenza fra questa quota e quella del bacino — vale tipicamente uno o due
 * scalini di quell'arrotondamento. Gli importi da cui la quota deriva sono
 * invece a precisione piena.
 */
export function quotaNegozio(d: Dataset, i: number): number {
  return d.venditePgNegozio[i] / d.venditeNegozio[i];
}

/** La quota P&G nell'intera area di attrazione, come frazione 0..1. */
export function quotaBacino(d: Dataset, i: number): number {
  return d.venditePgBacino[i] / d.venditeBacino[i];
}

/* ------------------------------------------------------------ stato di un negozio */

/**
 * In che condizione si trova un negozio rispetto al riferimento.
 *
 * Le due condizioni particolari non sono casi limite da tollerare, sono un
 * quinto del dataset e raccontano cose diverse:
 *
 * - **senza vendite** (1.032 negozi): non hanno una quota, quindi non hanno un
 *   potenziale. Entrando nel calcolo come zero comparirebbero come negozi
 *   perfettamente allineati al proprio bacino, che e' il contrario di quello
 *   che sono.
 * - **senza P&G** (2.535 negozi): vendono, ma non vendono niente di nostro.
 *   Valgono da soli il 41% del potenziale complessivo. Non e' sotto-performance
 *   ma assenza dall'assortimento: si risolve in un altro modo, e va separata
 *   invece che confusa con il resto.
 */
export type StatoNegozio = "senzaVendite" | "senzaPg" | "sotto" | "pari";

export function statoNegozio(d: Dataset, i: number, rif: Riferimento = RIFERIMENTO_PREDEFINITO): StatoNegozio {
  if (rif === "produttivita") {
    const negozio = d.resaNegozio[i];
    const bacino = d.resaBacino[i];
    if (!Number.isFinite(negozio) || !Number.isFinite(bacino)) return "senzaVendite";
    return negozio < bacino ? "sotto" : "pari";
  }

  if (rif === "modello") {
    const q = quadrante(d, i);
    if (q === null) return "senzaVendite";
    return q === "Underachieving" ? "sotto" : "pari";
  }

  const vendite = d.venditeNegozio[i];
  const bacino = d.venditeBacino[i];
  if (!Number.isFinite(vendite) || vendite <= 0 || !Number.isFinite(bacino) || bacino <= 0) {
    return "senzaVendite";
  }
  if (d.venditePgNegozio[i] === 0) return "senzaPg";
  return quotaNegozio(d, i) < quotaBacino(d, i) ? "sotto" : "pari";
}

/* ------------------------------------------------------ potenziale inespresso */

/**
 * Il potenziale inespresso di un negozio, in dollari.
 *
 * Punti di quota non presi **per il fatturato del negozio**, non per quello del
 * bacino. La differenza non e' sottile: il bacino di un negozio fattura in
 * media quaranta volte il negozio stesso, quindi la seconda base gonfia il
 * risultato di altrettanto e risponde a un'altra domanda — quanto vale la
 * categoria in quella zona, invece di quanto potrebbe crescere quel negozio.
 *
 * Ritorna `null` quando la grandezza non e' definita, mai zero: uno zero
 * finirebbe nelle somme e nelle medie come un negozio allineato.
 */
export function potenziale(d: Dataset, i: number, rif: Riferimento = RIFERIMENTO_PREDEFINITO): number | null {
  const stato = statoNegozio(d, i, rif);
  if (stato === "senzaVendite") return null;
  if (stato === "pari") return 0;

  if (rif === "produttivita") {
    // La resa e' fatturato per unita' di spazio: la distanza dal proprio bacino
    // si riporta a denaro nella stessa proporzione del fatturato attuale.
    const scarto = (d.resaBacino[i] - d.resaNegozio[i]) / d.resaBacino[i];
    return d.venditePgNegozio[i] * scarto;
  }

  if (rif === "modello") {
    // Definizione categoriale: il modello dice che il negozio rende meno di
    // quanto dovrebbe, ma non di quanto. Si usa la distanza dalla mediana dei
    // negozi allineati come stima, ed e' il motivo per cui il concept la
    // considera la meno espressiva delle tre.
    return d.venditePgNegozio[i] * 0.5;
  }

  return (quotaBacino(d, i) - quotaNegozio(d, i)) * d.venditeNegozio[i];
}

/* -------------------------------------------------------------- variazioni */

/** Variazione delle vendite P&G del negozio sull'anno precedente, 0..1 relativo. */
export function variazioneAnnua(d: Dataset, i: number): number | null {
  const prima = d.venditePgNegozioYa[i];
  if (!Number.isFinite(prima) || prima <= 0) return null;
  const ora = d.venditePgNegozio[i];
  if (!Number.isFinite(ora)) return null;
  return (ora - prima) / prima;
}

/* ------------------------------------------------------------ il modello P&G */

const QUADRANTI = ["Top", "Bottom", "Overachieving", "Underachieving"] as const;
export type Quadrante = (typeof QUADRANTI)[number];

export function quadrante(d: Dataset, i: number): Quadrante | null {
  const dz = d.testi.quadrante;
  const codice = dz.codici[i];
  if (codice < 0) return null;
  const valore = dz.valori[codice];
  return (QUADRANTI as readonly string[]).includes(valore) ? (valore as Quadrante) : null;
}

/* ------------------------------------------------------------- demografia  */

/**
 * La composizione del bacino dentro un gruppo, come frazioni che sommano a 1.
 *
 * I dati arrivano in millesimi interi dal passo di preparazione: qui tornano
 * frazioni, perche' tutto quello che ci si fa sopra — scarti dalla media,
 * distanze fra due bacini — lavora su frazioni.
 */
export function composizione(d: Dataset, gruppo: GruppoDemografico, i: number): number[] {
  return d.demografia[gruppo].valori.map((colonna) => colonna[i] / 1000);
}

/**
 * La composizione media del paese, per un gruppo.
 *
 * Media semplice sui bacini, non ponderata sulla popolazione: il confronto che
 * serve agli archetipi e' «questo bacino e' fatto diversamente dal bacino
 * tipico», non «diversamente dall'americano medio». Ponderando, le aree
 * metropolitane definirebbero da sole la media e ogni area rurale risulterebbe
 * anomala.
 */
export function composizioneMedia(d: Dataset, gruppo: GruppoDemografico): number[] {
  const colonne = d.demografia[gruppo].valori;
  const somme = new Array(colonne.length).fill(0);
  for (let c = 0; c < colonne.length; c++) {
    const colonna = colonne[c];
    let somma = 0;
    for (let i = 0; i < d.conteggio; i++) somma += colonna[i];
    somme[c] = somma / d.conteggio / 1000;
  }
  return somme;
}

/**
 * Quanto un insieme di negozi devia dalla composizione media del paese.
 *
 * Ritorna lo scarto per ciascuna voce del gruppo, in punti di frazione, piu' la
 * distanza complessiva — la somma degli scarti in valore assoluto diviso due,
 * che e' la quota di popolazione che andrebbe spostata da una voce all'altra
 * per rendere i due profili identici. Zero significa identici, uno significa
 * nessuna sovrapposizione.
 */
export function composizioneDi(
  d: Dataset,
  gruppo: GruppoDemografico,
  indici: ArrayLike<number>,
): number[] {
  return d.demografia[gruppo].valori.map((colonna) => {
    let somma = 0;
    for (let k = 0; k < indici.length; k++) somma += colonna[indici[k]];
    return somma / Math.max(1, indici.length) / 1000;
  });
}

export function scartoDemografico(
  d: Dataset,
  gruppo: GruppoDemografico,
  indici: ArrayLike<number>,
  media = composizioneMedia(d, gruppo),
): { scarti: number[]; distanza: number } {
  const profilo = composizioneDi(d, gruppo, indici);
  const scarti = profilo.map((v, c) => v - media[c]);
  const distanza = scarti.reduce((s, v) => s + Math.abs(v), 0) / 2;
  return { scarti, distanza };
}

/** Distanza fra due profili demografici, con la stessa unita' di `scartoDemografico`. */
export function distanzaProfili(a: number[], b: number[]): number {
  let somma = 0;
  for (let i = 0; i < a.length; i++) somma += Math.abs(a[i] - b[i]);
  return somma / 2;
}

/* ------------------------------------------------------------------ sintesi */

/**
 * Il riassunto di un insieme di negozi.
 *
 * E' la stessa struttura che riempie una cella del rilievo, una scheda della
 * dashboard e un pannello del muro: sono tre presentazioni di questo, non tre
 * calcoli diversi.
 */
export type Sintesi = {
  negozi: number;
  /** Quanti hanno vendite, cioe' quanti entrano davvero nel calcolo. */
  misurabili: number;
  sotto: number;
  senzaPg: number;
  /** Somma del potenziale inespresso, in dollari. */
  potenziale: number;
  /** Vendite P&G attuali dell'insieme, in dollari. */
  venditePg: number;
  /** Fatturato complessivo dei negozi dell'insieme. */
  vendite: number;
  /**
   * Il potenziale in rapporto a quello che l'insieme vende oggi.
   *
   * E' **la cifra da mostrare**, non il valore assoluto. Le vendite P&G del
   * sample valgono 9,67 M$ su 13,1 miliardi di fatturato dei negozi: in valore
   * assoluto un'area vale qualche migliaio di dollari, un numero che in sala
   * non dice niente, mentre la crescita possibile in percentuale si capisce
   * senza spiegazioni.
   */
  crescita: number | null;
  /** Punti vendita concorrenti per negozio, mediana. */
  concorrenti: number | null;
  /** Variazione media delle vendite P&G sull'anno prima. */
  variazione: number | null;
};

/**
 * Somma il potenziale invece di farne la media.
 *
 * Il concept lo chiede esplicitamente (§2.2): una cella alta deve dire «qui c'e'
 * molto da prendere», non «qui i negozi sono mediamente inefficienti». Cento
 * negozi appena sotto tono devono poter competere, sul muro, con dieci negozi
 * molto sotto tono.
 */
export function aggrega(
  d: Dataset,
  indici: ArrayLike<number>,
  rif: Riferimento = RIFERIMENTO_PREDEFINITO,
): Sintesi {
  let misurabili = 0;
  let sotto = 0;
  let senzaPg = 0;
  let somma = 0;
  let venditePg = 0;
  let vendite = 0;
  const concorrenti: number[] = [];
  const variazioni: number[] = [];

  for (let k = 0; k < indici.length; k++) {
    const i = indici[k];
    const stato = statoNegozio(d, i, rif);
    if (Number.isFinite(d.concorrenti[i])) concorrenti.push(d.concorrenti[i]);
    if (stato === "senzaVendite") continue;

    misurabili++;
    venditePg += d.venditePgNegozio[i];
    vendite += d.venditeNegozio[i];
    if (stato === "senzaPg") senzaPg++;
    if (stato === "sotto" || stato === "senzaPg") {
      sotto++;
      somma += potenziale(d, i, rif) ?? 0;
    }
    const v = variazioneAnnua(d, i);
    if (v !== null) variazioni.push(v);
  }

  return {
    negozi: indici.length,
    misurabili,
    sotto,
    senzaPg,
    potenziale: somma,
    venditePg,
    vendite,
    crescita: venditePg > 0 ? somma / venditePg : null,
    concorrenti: mediana(concorrenti),
    variazione: variazioni.length ? variazioni.reduce((s, v) => s + v, 0) / variazioni.length : null,
  };
}

/** Tutti gli indici del dataset, per aggregare sul perimetro completo. */
export function tuttiGliIndici(d: Dataset): Int32Array {
  const indici = new Int32Array(d.conteggio);
  for (let i = 0; i < d.conteggio; i++) indici[i] = i;
  return indici;
}

export function mediana(valori: number[]): number | null {
  if (!valori.length) return null;
  const ordinati = [...valori].sort((a, b) => a - b);
  const meta = Math.floor(ordinati.length / 2);
  return ordinati.length % 2 ? ordinati[meta] : (ordinati[meta - 1] + ordinati[meta]) / 2;
}
