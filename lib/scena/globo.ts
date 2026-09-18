/**
 * La scena di apertura sul globo.
 *
 * Serve a dare al mondo qualcosa da mostrare mentre gira, prima che la sequenza
 * scenda sul paese: nodi sparsi sui continenti e collegamenti che si tracciano
 * uno alla volta.
 *
 * **Sono dati decorativi e non lo nascondono.** Le posizioni sono coordinate
 * vere di citta' vere — servono a non piantare nodi in mezzo all'oceano, che si
 * vedrebbe subito — ma i collegamenti fra loro sono inventati e non
 * rappresentano niente. In una pagina di prova va bene; nel prodotto un globo
 * di apertura andrebbe costruito sui dati veri, o dichiarato come sfondo.
 */

const RAGGIO_TERRESTRE = 6_371_000;

/** Citta' sui continenti, per non mettere nodi in acqua. */
const LUOGHI: [number, number][] = [
  [-74.0, 40.7], [-87.6, 41.9], [-118.2, 34.1], [-95.4, 29.8], [-79.4, 43.7],
  [-99.1, 19.4], [-46.6, -23.6], [-58.4, -34.6], [-70.7, -33.4], [-77.0, -12.0],
  [-3.7, 40.4], [2.4, 48.9], [-0.1, 51.5], [13.4, 52.5], [12.5, 41.9],
  [37.6, 55.8], [28.98, 41.0], [31.2, 30.0], [3.4, 6.5], [18.4, -33.9],
  [36.8, -1.3], [55.3, 25.3], [72.9, 19.1], [77.2, 28.6], [100.5, 13.8],
  [103.8, 1.35], [114.2, 22.3], [121.5, 31.2], [139.7, 35.7], [127.0, 37.6],
  [151.2, -33.9], [174.8, -36.9], [106.8, -6.2], [30.5, 50.5], [-123.1, 49.3],
];

export type NodoGlobo = {
  position: [number, number];
  hub: boolean;
  valore: number;
};

export type ArcoGlobo = {
  path: [number, number, number][];
  timestamps: number[];
  valore: number;
};

export type ScenaGlobo = {
  nodi: NodoGlobo[];
  archi: ArcoGlobo[];
  /** Istante oltre il quale tutti i collegamenti sono tracciati. */
  fine: number;
};

/**
 * Interpolazione sul grande cerchio.
 *
 * Su una sfera non si puo' interpolare fra due coordinate come se fossero due
 * punti su un foglio: il risultato passa dove non dovrebbe e su tratte lunghe
 * si vede subito che la linea non e' una rotta ma un segmento disegnato male.
 */
function suGrandeCerchio(
  a: [number, number],
  b: [number, number],
  t: number,
): [number, number] {
  const rad = Math.PI / 180;
  const [lng1, lat1] = [a[0] * rad, a[1] * rad];
  const [lng2, lat2] = [b[0] * rad, b[1] * rad];
  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((lat2 - lat1) / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin((lng2 - lng1) / 2) ** 2,
      ),
    );
  if (d < 1e-9) return a;
  const A = Math.sin((1 - t) * d) / Math.sin(d);
  const B = Math.sin(t * d) / Math.sin(d);
  const x = A * Math.cos(lat1) * Math.cos(lng1) + B * Math.cos(lat2) * Math.cos(lng2);
  const y = A * Math.cos(lat1) * Math.sin(lng1) + B * Math.cos(lat2) * Math.sin(lng2);
  const z = A * Math.sin(lat1) + B * Math.sin(lat2);
  return [Math.atan2(y, x) / rad, Math.atan2(z, Math.hypot(x, y)) / rad];
}

function distanzaM(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLng = (b[0] - a[0]) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * RAGGIO_TERRESTRE * Math.asin(Math.sqrt(h));
}

export function costruisciGlobo({ collegamenti = 18, seed = 7 } = {}): ScenaGlobo {
  let stato = seed;
  const rnd = () => {
    stato = (stato * 1664525 + 1013904223) % 4294967296;
    return stato / 4294967296;
  };

  const nodi: NodoGlobo[] = LUOGHI.map((position, i) => ({
    position,
    // Un nodo su cinque e' un hub: abbastanza da riconoscere due categorie,
    // non tanti da far sembrare il mondo una sola cosa.
    hub: i % 5 === 0,
    valore: 0.15 + rnd() * 0.85,
  }));

  const CAMPIONI = 40;
  const SPAN = 100;
  const archi: ArcoGlobo[] = [];
  for (let k = 0; k < collegamenti; k++) {
    const da = nodi[k % nodi.length];
    const a = nodi[(k * 7 + 3) % nodi.length];
    if (da === a) continue;

    const lunghezza = distanzaM(da.position, a.position);
    // Un arco basso: a questa scala una quota alta esce dalla sagoma del
    // pianeta e il collegamento smette di sembrare appoggiato al mondo.
    const vertice = lunghezza * 0.09;
    const path: [number, number, number][] = [];
    const timestamps: number[] = [];
    // Ogni collegamento parte per conto suo: e' quello che li fa apparire
    // «ogni tanto» invece che tutti insieme.
    const ritardo = (k / collegamenti) * SPAN * 0.75 + rnd() * 6;
    for (let i = 0; i < CAMPIONI; i++) {
      const t = i / (CAMPIONI - 1);
      const [lng, lat] = suGrandeCerchio(da.position, a.position, t);
      path.push([lng, lat, Math.sin(t * Math.PI) * vertice]);
      timestamps.push(ritardo + t * SPAN * 0.35);
    }
    archi.push({ path, timestamps, valore: (da.valore + a.valore) / 2 });
  }

  return {
    nodi,
    archi,
    fine: Math.max(...archi.map((a) => a.timestamps[a.timestamps.length - 1])) + 1,
  };
}
