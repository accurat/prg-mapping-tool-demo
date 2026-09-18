/**
 * Dai negozi alle celle del rilievo e alle aree con un nome.
 *
 * Sono due raggruppamenti diversi solo nel modo di scegliere la chiave: le
 * celle la ricavano dalla posizione, le aree la leggono da una colonna di
 * testo. Tutto il resto — raccogliere gli indici, riassumerli, ordinarli — e'
 * lo stesso codice, e lo e' di proposito: la cella che si tocca sul muro e la
 * riga che compare in una scheda devono dire lo stesso numero.
 */

// Le importazioni portano l'estensione per intero: e' quello che permette a
// questi moduli di girare anche sotto node, e quindi alle verifiche di
// eseguire gli stessi conti che esegue la pagina invece di una loro copia.
import { centroCella, cellaDi, daMercatore, mercatore } from "./grid.ts";
import { aggrega, type Riferimento, type Sintesi } from "./metrics.ts";
import type { CampoTesto, Dataset } from "./schema.ts";

/**
 * Sotto questa soglia la cella non si alza.
 *
 * Il concept (§2.5) la mette a cinque e spiega perche' con il caso peggiore in
 * presentazione: si indica un picco, qualcuno chiede su quanti negozi si basa,
 * e la risposta e' "tre". La cella resta pero' nell'elenco e resta
 * interrogabile — non si nasconde il dato, si nega l'autorevolezza che
 * l'estrusione le darebbe.
 */
export const MINIMO_NEGOZI = 5;

export type Opzioni = {
  riferimento?: Riferimento;
  minimoNegozi?: number;
};

type Raggruppamento = {
  /** Gli indici dei negozi, nell'ordine in cui compaiono nel dataset. */
  indici: Int32Array;
  sintesi: Sintesi;
  /** Vero quando i negozi non bastano a rendere il dato affidabile. */
  sottoSoglia: boolean;
};

export type Cella = Raggruppamento & {
  chiave: number;
  /** Il centro geometrico della cella, non il baricentro dei negozi. */
  centro: [number, number];
};

export type Area = Raggruppamento & {
  nome: string;
  /** Il baricentro dei negozi: un'area amministrativa non ha un centro proprio. */
  centro: [number, number];
};

/**
 * Raccoglie gli indici per chiave.
 *
 * Si accumula in vettori normali e si compatta alla fine: dimensionare i
 * vettori tipizzati in anticipo richiederebbe una passata in piu' per contare,
 * e su diecimila elementi la passata costa piu' di quanto si risparmi.
 */
function raggruppa(
  indici: ArrayLike<number>,
  chiaveDi: (i: number) => number,
): Map<number, number[]> {
  const gruppi = new Map<number, number[]>();
  for (let k = 0; k < indici.length; k++) {
    const i = indici[k];
    const chiave = chiaveDi(i);
    if (chiave === -1) continue;
    const gruppo = gruppi.get(chiave);
    if (gruppo) gruppo.push(i);
    else gruppi.set(chiave, [i]);
  }
  return gruppi;
}

function riassumi(
  d: Dataset,
  indici: number[],
  riferimento: Riferimento | undefined,
  minimoNegozi: number,
): Raggruppamento {
  return {
    indici: Int32Array.from(indici),
    sintesi: aggrega(d, indici, riferimento),
    sottoSoglia: indici.length < minimoNegozi,
  };
}

/* -------------------------------------------------------------- le celle  */

export function aggregaInCelle(
  d: Dataset,
  indici: ArrayLike<number>,
  raggio: number,
  { riferimento, minimoNegozi = MINIMO_NEGOZI }: Opzioni = {},
): Cella[] {
  // La proiezione si calcola una volta per negozio, non una volta per cella.
  const gruppi = raggruppa(indici, (i) => {
    const lat = d.lat[i];
    const lng = d.lng[i];
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return -1;
    const [x, y] = mercatore(lng, lat);
    return cellaDi(x, y, raggio);
  });

  const celle: Cella[] = [];
  for (const [chiave, gruppo] of gruppi) {
    const [x, y] = centroCella(chiave, raggio);
    celle.push({
      chiave,
      centro: daMercatore(x, y),
      ...riassumi(d, gruppo, riferimento, minimoNegozi),
    });
  }
  return celle;
}

/* --------------------------------------------------------------- le aree  */

export function aggregaPerCampo(
  d: Dataset,
  indici: ArrayLike<number>,
  campo: CampoTesto,
  { riferimento, minimoNegozi = MINIMO_NEGOZI }: Opzioni = {},
): Area[] {
  const dizionario = d.testi[campo];
  const gruppi = raggruppa(indici, (i) => dizionario.codici[i]);

  const aree: Area[] = [];
  for (const [codice, gruppo] of gruppi) {
    let sommaLng = 0;
    let sommaLat = 0;
    for (const i of gruppo) {
      sommaLng += d.lng[i];
      sommaLat += d.lat[i];
    }
    aree.push({
      nome: dizionario.valori[codice],
      centro: [sommaLng / gruppo.length, sommaLat / gruppo.length],
      ...riassumi(d, gruppo, riferimento, minimoNegozi),
    });
  }
  return aree;
}

/* ------------------------------------------------------- la scala verticale */

/**
 * La scala delle altezze, con il taglio degli estremi.
 *
 * Due regole del concept (§2.4), che vanno insieme:
 *
 * - la scala e' **globale e fissa**, calcolata su tutte le celle e non su
 *   quelle inquadrate. Se fosse relativa alla vista, la stessa citta'
 *   cambierebbe altezza a seconda di cosa le sta intorno, e due momenti della
 *   sessione non sarebbero confrontabili;
 * - gli estremi si tagliano al 99esimo percentile, perche' un solo valore fuori
 *   scala produce una guglia che schiaccia tutto il resto del paese. Le celle
 *   tagliate restano marcate: non spariscono dal discorso, si sa che sono
 *   oltre il tetto.
 */
export function scalaAltezze(
  valori: number[],
  percentile = 0.99,
): { tetto: number; normalizza: (v: number) => number; oltreIlTetto: (v: number) => boolean } {
  const positivi = valori.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  const tetto = positivi.length
    ? positivi[Math.min(positivi.length - 1, Math.floor(positivi.length * percentile))]
    : 0;
  return {
    tetto,
    normalizza: (v) => (tetto > 0 ? Math.max(0, Math.min(1, v / tetto)) : 0),
    oltreIlTetto: (v) => v > tetto,
  };
}
