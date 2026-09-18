/**
 * La forma dei dati preparati da `scripts/build-dataset.mjs`, e il loro
 * caricamento.
 *
 * Il file su disco e' **per colonne**, non per righe: diecimila oggetti con
 * quaranta campi ciascuno costano al parser molto piu' di quaranta vettori da
 * diecimila numeri, e tutto quello che ci facciamo sopra — sommare, ordinare,
 * confrontare — scorre una colonna per volta.
 *
 * In memoria le colonne diventano vettori tipizzati. Non e' ottimizzazione
 * prematura: il rilievo li riaggrega a ogni cambio di scala e le storie li
 * attraversano sette volte, una per archetipo.
 */

export type GruppoDemografico = "eta" | "reddito" | "istruzione" | "etnia";

export type CampoTesto = "citta" | "contea" | "mercato" | "stato" | "insegna" | "quadrante";

/** La classificazione del modello P&G, come sta nel dataset. */
export type Quadrante = "Top" | "Bottom" | "Overachieving" | "Underachieving";

/** Colonna di testo: i valori distinti una volta sola, e un codice per riga. */
export type Dizionario = {
  valori: string[];
  codici: Int32Array;
};

export type Dataset = {
  conteggio: number;

  lat: Float64Array;
  lng: Float64Array;

  /** Fatturato totale del negozio, tutte le insegne di prodotto. */
  venditeNegozio: Float64Array;
  venditeNegozioYa: Float64Array;
  /** La parte di quel fatturato che e' prodotto P&G. */
  venditePgNegozio: Float64Array;
  venditePgNegozioYa: Float64Array;

  /** Le stesse due grandezze sull'intera area di attrazione del negozio. */
  venditeBacino: Float64Array;
  venditeBacinoYa: Float64Array;
  venditePgBacino: Float64Array;
  venditePgBacinoYa: Float64Array;

  resaNegozio: Float64Array;
  resaBacino: Float64Array;

  /** Punti vendita concorrenti nell'area, tutte le insegne. */
  concorrenti: Float64Array;
  famiglie: Float64Array;
  stelle: Float64Array;

  testi: Record<CampoTesto, Dizionario>;

  /** Le tredici insegne concorrenti, una colonna ciascuna. */
  insegneConcorrenti: { nomi: string[]; valori: Int32Array[] };

  /**
   * La composizione del bacino in millesimi, dentro ciascun gruppo.
   *
   * Non sono conteggi: un bacino da quarantamila persone e uno da quattromila
   * vanno confrontati per **come sono fatti**, non per quanto sono grandi. Il
   * conteggio assoluto resta in `famiglie`.
   */
  demografia: Record<GruppoDemografico, { campi: string[]; valori: Int32Array[] }>;
};

/**
 * Le rotte di rifornimento, gia' agganciate ai negozi per indice.
 *
 * L'aggancio avviene nel passo di preparazione confrontando le coordinate, ed
 * e' esatto, non tollerante: `conteggio` contro `totaleNelFile` dice quante ne
 * hanno trovato un negozio a entrambi gli estremi. Se un giorno quel rapporto
 * scende, la rete non si impoverisce poco per volta, smette — e l'unico modo di
 * accorgersene e' guardare questi due numeri.
 */
export type Rotte = {
  conteggio: number;
  totaleNelFile: number;
  origine: Int32Array;
  destinazione: Int32Array;
  casse: Float64Array;
  pezzi: Float64Array;
  valore: Float64Array;
};

export type Glossario = {
  etichette: Record<string, { etichetta: string; categoria: string | null; gruppo: string | null; formato: string | null }>;
};

/* ------------------------------------------------------------- conversione */

const numeri = (v: (number | null)[]): Float64Array =>
  // `null` diventa NaN invece di zero: un dato che manca non e' un dato che
  // vale zero, e la differenza conta esattamente dove fa piu' danno — un
  // negozio senza fatturato sembrerebbe perfettamente allineato al suo bacino.
  Float64Array.from(v, (x) => (x === null ? Number.NaN : x));

const interi = (v: number[]): Int32Array => Int32Array.from(v);

export type DatasetGrezzo = {
  conteggio: number;
  colonne: Record<string, (number | null)[]>;
  testi: Record<string, { valori: string[]; codici: number[] }>;
  concorrenti: { insegne: string[]; valori: number[][] };
  demografia: { gruppi: Record<string, { campi: string[]; valori: number[][] }> };
};

export function daGrezzo(g: DatasetGrezzo): Dataset {
  const c = (nome: string) => numeri(g.colonne[nome]);
  return {
    conteggio: g.conteggio,
    lat: c("lat"),
    lng: c("lng"),
    venditeNegozio: c("venditeNegozio"),
    venditeNegozioYa: c("venditeNegozioYa"),
    venditePgNegozio: c("venditePgNegozio"),
    venditePgNegozioYa: c("venditePgNegozioYa"),
    venditeBacino: c("venditeBacino"),
    venditeBacinoYa: c("venditeBacinoYa"),
    venditePgBacino: c("venditePgBacino"),
    venditePgBacinoYa: c("venditePgBacinoYa"),
    resaNegozio: c("resaNegozio"),
    resaBacino: c("resaBacino"),
    concorrenti: c("concorrenti"),
    famiglie: c("famiglie"),
    stelle: c("stelle"),
    testi: Object.fromEntries(
      Object.entries(g.testi).map(([nome, d]) => [nome, { valori: d.valori, codici: interi(d.codici) }]),
    ) as Record<CampoTesto, Dizionario>,
    insegneConcorrenti: {
      nomi: g.concorrenti.insegne,
      valori: g.concorrenti.valori.map(interi),
    },
    demografia: Object.fromEntries(
      Object.entries(g.demografia.gruppi).map(([nome, gr]) => [
        nome,
        { campi: gr.campi, valori: gr.valori.map(interi) },
      ]),
    ) as Dataset["demografia"],
  };
}

/* -------------------------------------------------------------- caricamento */

export async function caricaDataset(base = "/data"): Promise<{
  dataset: Dataset;
  rotte: Rotte;
  glossario: Glossario;
}> {
  const [negozi, rotte, glossario] = await Promise.all([
    fetch(`${base}/stores.json`).then((r) => r.json() as Promise<DatasetGrezzo>),
    fetch(`${base}/routes.json`).then((r) => r.json()),
    fetch(`${base}/glossary.json`).then((r) => r.json() as Promise<Glossario>),
  ]);

  return {
    dataset: daGrezzo(negozi),
    rotte: {
      conteggio: rotte.conteggio,
      totaleNelFile: rotte.totaleNelFile,
      origine: interi(rotte.origine),
      destinazione: interi(rotte.destinazione),
      casse: numeri(rotte.casse),
      pezzi: numeri(rotte.pezzi),
      valore: numeri(rotte.valore),
    },
    glossario,
  };
}

/** Il valore di una colonna di testo per una riga, o null se assente. */
export function testo(dataset: Dataset, campo: CampoTesto, i: number): string | null {
  const d = dataset.testi[campo];
  const codice = d.codici[i];
  return codice < 0 ? null : d.valori[codice];
}
