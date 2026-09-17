export type Route = {
  source: [number, number];
  target: [number, number];
  /** Intensita' del flusso, 0..1: nel prodotto sarebbe casse, pezzi o valore. */
  weight: number;
};

/**
 * Genera rotte da pochi centri di distribuzione a molti punti vendita.
 *
 * La struttura conta: nel dataset reale le rotte partono da un numero ristretto
 * di hub e arrivano sparse sul territorio. Una distribuzione a caso fra coppie
 * qualunque produrrebbe un groviglio uniforme, che e' piu' facile da disegnare
 * e non somiglia a niente.
 */
export function makeRoutes({
  center,
  count,
  hubs = 6,
  spreadDeg = 6,
  seed = 7,
}: {
  center: [number, number];
  count: number;
  hubs?: number;
  spreadDeg?: number;
  seed?: number;
}): Route[] {
  let state = seed;
  const rnd = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };

  const [lng, lat] = center;
  const hubPoints: [number, number][] = Array.from({ length: hubs }, () => [
    lng + (rnd() - 0.5) * spreadDeg * 1.2,
    lat + (rnd() - 0.5) * spreadDeg * 0.7,
  ]);

  return Array.from({ length: count }, () => {
    const source = hubPoints[Math.floor(rnd() * hubPoints.length)];
    const target: [number, number] = [
      lng + (rnd() - 0.5) * spreadDeg * 2,
      lat + (rnd() - 0.5) * spreadDeg,
    ];
    return { source, target, weight: rnd() };
  });
}

export type TripPath = {
  path: [number, number, number][];
  timestamps: number[];
  weight: number;
};

/**
 * Trasforma le rotte in percorsi campionati, per l'animazione di flusso.
 *
 * L'arco disegnato da deck.gl e' una sola primitiva e non puo' mostrare
 * scorrimento: per far vedere la merce che si muove serve un percorso con dei
 * tempi lungo cui far correre una scia. Il costo e' che ogni rotta smette di
 * essere due punti e diventa `samples` punti — ed e' esattamente cio' che
 * questo test deve quantificare.
 */
export function toTripPaths(routes: Route[], samples = 24, cycle = 1000): TripPath[] {
  return routes.map((r, i) => {
    const path: [number, number, number][] = [];
    const timestamps: number[] = [];

    // Sfasamento per rotta: altrimenti tutte le scie partirebbero insieme e il
    // flusso sembrerebbe un battito invece che un movimento continuo.
    const offset = (i * 37) % cycle;

    for (let s = 0; s < samples; s++) {
      const t = s / (samples - 1);
      const lng = r.source[0] + (r.target[0] - r.source[0]) * t;
      const lat = r.source[1] + (r.target[1] - r.source[1]) * t;
      // Profilo a campana: l'arco si alza a meta' percorso.
      const height = Math.sin(t * Math.PI) * 90000 * (0.4 + r.weight * 0.6);
      path.push([lng, lat, height]);
      timestamps.push(offset + t * cycle * 0.6);
    }

    return { path, timestamps, weight: r.weight };
  });
}
