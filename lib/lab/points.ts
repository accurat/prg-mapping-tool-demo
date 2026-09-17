export type StorePoint = {
  position: [number, number];
  /** Valore per negozio: nel prodotto sarebbe il potenziale inespresso. */
  value: number;
  /** Lo stesso valore un anno prima, per la transizione di altezza. */
  valueBefore: number;
};

/**
 * Genera punti vendita finti con una distribuzione plausibile.
 *
 * Non uniformi: i negozi stanno in citta', quindi i punti si addensano attorno
 * a pochi centri e si diradano fuori. La differenza non e' estetica — una
 * distribuzione uniforme darebbe a ogni cella lo stesso numero di punti e
 * renderebbe l'aggregazione piu' facile e piu' regolare di quanto sara' con
 * dati veri.
 */
export function makeStorePoints({
  center,
  count,
  clusters = 12,
  spreadDeg = 3,
  seed = 1,
}: {
  center: [number, number];
  count: number;
  clusters?: number;
  spreadDeg?: number;
  seed?: number;
}): StorePoint[] {
  // Generatore deterministico: la stessa configurazione deve dare gli stessi
  // punti, altrimenti due misure non sono confrontabili.
  let state = seed;
  const rnd = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };

  const [lng, lat] = center;
  const hubs = Array.from({ length: clusters }, () => ({
    lng: lng + (rnd() - 0.5) * spreadDeg * 2,
    lat: lat + (rnd() - 0.5) * spreadDeg,
    tightness: 0.05 + rnd() * 0.25,
  }));

  const points: StorePoint[] = [];
  for (let i = 0; i < count; i++) {
    // Un punto su cinque e' sparso fuori dai centri: le campagne esistono.
    const inCluster = rnd() > 0.2;
    const hub = hubs[Math.floor(rnd() * hubs.length)];

    const position: [number, number] = inCluster
      ? [
          hub.lng + (rnd() - 0.5) * hub.tightness,
          hub.lat + (rnd() - 0.5) * hub.tightness * 0.6,
        ]
      : [lng + (rnd() - 0.5) * spreadDeg * 2, lat + (rnd() - 0.5) * spreadDeg];

    const value = rnd();
    // L'anno prima: correlato ma non identico, come sarebbe nei dati veri.
    const valueBefore = Math.max(0, Math.min(1, value + (rnd() - 0.5) * 0.5));

    points.push({ position, value, valueBefore });
  }

  return points;
}
