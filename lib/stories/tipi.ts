/**
 * Le forme di una storia.
 *
 * Una storia non e' un testo: e' un record. Un'area, un criterio che e'
 * scattato, i numeri che lo dimostrano, e una frase costruita da un template.
 * Il testo e' l'ultima cosa che si calcola e la meno importante.
 */

import type { Sintesi } from "../data/metrics.ts";

export type ArchetipoId =
  | "campoLibero"
  | "sottoAssedio"
  | "annoPerduto"
  | "anomalieModello"
  | "pubblicoCheNonTorna"
  | "gemelliDivergenti"
  | "concentrazione";

/**
 * L'unita' su cui lavora il calcolo.
 *
 * Le storie ragionano sulle **celle gia' aggregate del rilievo**, non sui
 * singoli punti vendita (§3.2): un'anomalia su un negozio solo non e' una
 * storia, e' un caso. Alcuni archetipi hanno pero' bisogno di un livello piu'
 * grossolano — la concentrazione non esiste a livello di cella — e la stessa
 * struttura serve per entrambi.
 */
export type Unita = {
  /** Chiave stabile: due calcoli sullo stesso dataset devono produrla uguale. */
  id: string;
  /** Il nome reale del luogo, mai un codice. */
  nome: string;
  centro: [number, number];
  indici: Int32Array;
  sintesi: Sintesi;
  sottoSoglia: boolean;
};

/** Un numero che ha fatto scattare il criterio, pronto da mostrare. */
export type Numero = {
  etichetta: string;
  valore: string;
  /** Vero per il numero che e' la ragione della storia, non solo contorno. */
  principale?: boolean;
};

/**
 * Quello che il muro deve fare quando la storia viene scelta.
 *
 * Fa parte della storia e non della vista: e' il contratto fra la dashboard che
 * la mostra e la scena che la esegue, e il motivo per cui una storia si puo'
 * provare il giorno prima e ritrovare identica.
 */
export type Regia = {
  centro: [number, number];
  zoom: number;
  /** Lo strato esplicativo coerente con l'archetipo (§3.6), o nessuno. */
  strato: "concorrenti" | "demografia" | "annoPrecedente" | "modello" | null;
};

export type Candidata = {
  archetipo: ArchetipoId;
  aree: Unita[];
  /** Quanto e' estremo il caso, 0..1. Normalizzato dentro l'archetipo. */
  anomalia: number;
  numeri: Numero[];
  /** Pezzi variabili della frase, gia' formattati. */
  frase: Record<string, string>;
};

export type Storia = Candidata & {
  id: string;
  /** L'etichetta dell'archetipo, come compare a schermo. */
  titolo: string;
  luogo: string;
  testo: string;
  sintesi: Sintesi;
  regia: Regia;
  punteggio: number;
  /** Vero per le storie salvate a mano in preparazione (§3.7). */
  manuale?: boolean;
};

export type Soglie = {
  /** Sopra quale percentile di potenziale un'area conta come "alto". */
  potenzialeAlto: number;
  /** Sotto quale multiplo della mediana nazionale i concorrenti sono "pochi". */
  concorrentiPochi: number;
  /** Sopra quale multiplo i concorrenti sono "molti". */
  concorrentiMolti: number;
  /**
   * Quanti punti sotto la variazione tipica del paese conta come "calo marcato".
   *
   * E' uno **scarto**, non un valore assoluto: su questo dataset la linea P&G
   * arretra ovunque, e una soglia assoluta segnalerebbe meta' del paese.
   */
  caloMarcato: number;
  /** Quanta parte dei negozi deve andare peggio del paese perche' sia "diffuso". */
  caloDiffuso: number;
  /** Quante volte la quota nazionale di un quadrante conta come concentrazione. */
  modelloConcentrato: number;
  /** Sopra quale distanza demografica un bacino e' "particolare". */
  demografiaAnomala: number;
  /** Sotto quale distanza demografica due aree sono "gemelle". */
  demografiaGemella: number;
  /** Quanta differenza di performance serve perche' due gemelle "divergano". */
  divergenzaGemelli: number;
};

export type Configurazione = {
  /** Quali archetipi sono attivi. */
  attivi: ArchetipoId[];
  /** Quante storie mostrare. */
  quante: number;
  /** Minimo di punti vendita perche' un'area possa diventare una storia. */
  minimoNegozi: number;
  /** Due storie non possono riguardare aree piu' vicine di cosi', in km. */
  distanzaMinimaKm: number;
  /** Quante storie al massimo per lo stesso archetipo. */
  massimoPerArchetipo: number;
  /**
   * Quanto pesa il valore economico rispetto all'entita' dell'anomalia, 0..1.
   *
   * A zero vince il caso piu' estremo anche se vale poche migliaia di dollari;
   * a uno vince l'area piu' ricca anche se non ha niente di insolito. Il
   * punteggio e' la media geometrica dei due, cosi' un termine vicino a zero
   * affossa il totale invece di farsi compensare dall'altro.
   */
  pesoValore: number;
  /** Quante celle al massimo nel rilievo su cui si calcolano le storie. */
  celleMassime: number;
  soglie: Soglie;
};

export const CONFIGURAZIONE_PREDEFINITA: Configurazione = {
  attivi: [
    "concentrazione",
    "campoLibero",
    "sottoAssedio",
    "annoPerduto",
    "anomalieModello",
    "pubblicoCheNonTorna",
    "gemelliDivergenti",
  ],
  quante: 8,
  minimoNegozi: 5,
  distanzaMinimaKm: 150,
  massimoPerArchetipo: 2,
  pesoValore: 0.5,
  celleMassime: 3000,
  soglie: {
    potenzialeAlto: 0.8,
    concorrentiPochi: 0.7,
    concorrentiMolti: 1.4,
    caloMarcato: -0.1,
    caloDiffuso: 0.6,
    modelloConcentrato: 2,
    demografiaAnomala: 0.14,
    demografiaGemella: 0.05,
    divergenzaGemelli: 0.5,
  },
};

export const ETICHETTE: Record<ArchetipoId, string> = {
  campoLibero: "Open field",
  sottoAssedio: "Under siege",
  annoPerduto: "The lost year",
  anomalieModello: "Model anomalies",
  pubblicoCheNonTorna: "The audience that stays away",
  gemelliDivergenti: "Diverging twins",
  concentrazione: "The concentration",
};

export const STRATI: Record<ArchetipoId, Regia["strato"]> = {
  campoLibero: "concorrenti",
  sottoAssedio: "concorrenti",
  annoPerduto: "annoPrecedente",
  anomalieModello: "modello",
  pubblicoCheNonTorna: "demografia",
  gemelliDivergenti: "demografia",
  concentrazione: null,
};
