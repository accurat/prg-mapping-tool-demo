/**
 * La maglia esagonale del rilievo.
 *
 * Due differenze rispetto a `lib/lab/hexGrid.ts`, che resta com'e' perche'
 * serve ai test sintetici:
 *
 * - **la maglia vive in coordinate proiettate, non in gradi.** Un passo
 *   costante in gradi di latitudine non e' un passo costante sullo schermo, e
 *   su un paese che va dal 25esimo al 49esimo parallelo le celle risulterebbero
 *   larghe il 38% in piu' in fondo che in cima. Lavorando nella proiezione le
 *   celle sono uguali **dove vengono guardate**, che e' quello che conta per un
 *   rilievo letto a dodici metri.
 * - **l'assegnazione e' esatta.** La versione di laboratorio risolve la cella
 *   come se la maglia fosse rettangolare, e vicino ai vertici degli esagoni
 *   sbaglia di una cella: per un pennello che ne attraversa decine e'
 *   irrilevante, per un'aggregazione che decide l'altezza di una colonna no.
 *
 * Il prezzo della prima scelta: il raggio nominale e' una misura sulla mappa,
 * non sul terreno. Una cella "da 50 km" vale 50 km alla latitudine di
 * riferimento e meno piu' a nord. Per un rilievo e' il compromesso giusto; per
 * una statistica per chilometro quadrato non lo sarebbe.
 */

const RAGGIO_TERRESTRE = 6378137;
const CIRCONFERENZA = 2 * Math.PI * RAGGIO_TERRESTRE;

/** Latitudine a cui il raggio nominale corrisponde alla distanza reale. */
export const LATITUDINE_RIFERIMENTO = 39;

export function mercatore(lng: number, lat: number): [number, number] {
  const limitata = Math.max(-85.05112878, Math.min(85.05112878, lat));
  return [
    (lng * Math.PI * RAGGIO_TERRESTRE) / 180,
    RAGGIO_TERRESTRE * Math.log(Math.tan(Math.PI / 4 + (limitata * Math.PI) / 360)),
  ];
}

export function daMercatore(x: number, y: number): [number, number] {
  return [
    (x * 180) / (Math.PI * RAGGIO_TERRESTRE),
    (2 * Math.atan(Math.exp(y / RAGGIO_TERRESTRE)) - Math.PI / 2) * (180 / Math.PI),
  ];
}

/** Da metri sul terreno a metri nella proiezione, alla latitudine data. */
export function metriProiettati(metriReali: number, latitudine = LATITUDINE_RIFERIMENTO): number {
  return metriReali / Math.cos((latitudine * Math.PI) / 180);
}

/*
 * La chiave di una cella impacchetta le due coordinate assiali in un numero
 * solo: una stringa costerebbe un'allocazione per negozio, e i negozi sono
 * diecimila per ogni riaggregazione.
 */
const SCARTO = 2_000_000;
const MODULO = 4_000_000;

export const colonnaDi = (chiave: number) => Math.floor(chiave / MODULO) - SCARTO;
export const rigaDi = (chiave: number) => (chiave % MODULO) - SCARTO;

/**
 * La cella che contiene un punto, per arrotondamento in coordinate cubiche.
 *
 * Le tre coordinate di un esagono sommano sempre a zero. Si arrotondano tutte e
 * tre e si corregge quella che ha subito l'arrotondamento piu' grande: e'
 * l'unico modo di ottenere la cella davvero piu' vicina, invece della cella di
 * un reticolo rettangolare che le somiglia.
 */
export function cellaDi(x: number, y: number, raggio: number): number {
  const q = ((2 / 3) * x) / raggio;
  const r = (-x / 3 + (Math.sqrt(3) / 3) * y) / raggio;
  const s = -q - r;

  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);

  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);

  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;

  return (rq + SCARTO) * MODULO + (rr + SCARTO);
}

/** Il centro della cella, in coordinate proiettate. */
export function centroCella(chiave: number, raggio: number): [number, number] {
  const q = colonnaDi(chiave);
  const r = rigaDi(chiave);
  return [raggio * 1.5 * q, raggio * Math.sqrt(3) * (r + q / 2)];
}

/**
 * Il raggio di cella adatto a una vista, scelto su una scala a potenze di due.
 *
 * Due vincoli. Il primo viene da T9: oltre le tremila celle a schermo l'occhio
 * smette di distinguerle e il rilievo diventa una texture — il limite non e'
 * la scheda video, e' la percezione. Il secondo e' che il raggio **non puo'
 * variare con continuita'**: se seguisse lo zoom esattamente, il rilievo si
 * riformerebbe a ogni scatto della rotellina e le celle non starebbero mai
 * ferme. Con una scala a potenze di due la maglia cambia di rado e, quando
 * cambia, ogni cella si divide in quelle che la sostituiscono.
 */
export function raggioPerArea(areaProiettata: number, celleMassime = 3000): number {
  // Area di un esagono di raggio s: da qui si ricava s dall'area disponibile.
  const ideale = Math.sqrt(areaProiettata / (celleMassime * ((3 * Math.sqrt(3)) / 2)));
  const base = CIRCONFERENZA / 64;
  const livello = Math.max(0, Math.min(24, Math.round(Math.log2(base / ideale))));
  return base / Math.pow(2, livello);
}

/**
 * Il raggio adatto a una vista.
 *
 * **L'area da passare e' quella che contiene dati, non quella dell'inquadratura.**
 * A zoom nazionale il muro, largo 5760 pixel, inquadra piu' del mondo intero
 * mentre i negozi stanno su un sesto di quella larghezza: dimensionando sulla
 * finestra, il rilievo del paese esce con settantasei celle invece delle
 * tremila che potrebbe permettersi, cioe' quaranta volte piu' grosso del
 * necessario. Chi disegna il rilievo conosce il rettangolo dei propri dati e
 * passa l'intersezione fra quello e l'inquadratura.
 */
export function raggioPerVista({
  zoom,
  larghezzaPx,
  altezzaPx,
  celleMassime = 3000,
}: {
  zoom: number;
  larghezzaPx: number;
  altezzaPx: number;
  celleMassime?: number;
}): number {
  const metriPerPixel = CIRCONFERENZA / (256 * Math.pow(2, zoom));
  const larghezza = Math.min(CIRCONFERENZA, larghezzaPx * metriPerPixel);
  const altezza = Math.min(CIRCONFERENZA, altezzaPx * metriPerPixel);
  return raggioPerArea(larghezza * altezza, celleMassime);
}

/** Il rettangolo proiettato che contiene un insieme di punti. */
export function rettangoloDi(
  punti: { lng: ArrayLike<number>; lat: ArrayLike<number>; indici: ArrayLike<number> },
): { x0: number; y0: number; x1: number; y1: number; area: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let k = 0; k < punti.indici.length; k++) {
    const i = punti.indici[k];
    const lng = punti.lng[i];
    const lat = punti.lat[i];
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    const [x, y] = mercatore(lng, lat);
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (!Number.isFinite(x0)) return { x0: 0, y0: 0, x1: 0, y1: 0, area: 0 };
  return { x0, y0, x1, y1, area: (x1 - x0) * (y1 - y0) };
}
