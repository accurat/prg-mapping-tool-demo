export type Hub = {
  position: [number, number];
  index: number;
};

export type Store = {
  position: [number, number];
  /** A quale hub e' assegnato: definisce la stella. */
  hub: number;
  /** Potenziale inespresso normalizzato, 0..1. */
  value: number;
  /** Distanza dal proprio hub, normalizzata: serve a scaglionare l'animazione. */
  reach: number;
  /**
   * Quantita' di merce scambiata con il proprio hub, 0..1.
   *
   * Distinta dal potenziale: un negozio puo' ricevere molta merce e avere poco
   * margine, o viceversa. Nel prodotto sarebbero casse o pezzi dal dataset di
   * rete, qui e' correlata alla dimensione ma non identica.
   */
  volume: number;
};

/**
 * Genera una rete a stella: pochi hub, molti negozi, ciascuno assegnato al
 * proprio hub.
 *
 * I negozi si addensano attorno ai centri con distribuzione radiale — un
 * offset uniforme su ciascun asse produrrebbe agglomerati rettangolari che
 * sembrano un difetto di resa.
 */
export function makeStoreNetwork({
  center,
  hubs = 5,
  storesPerHub = 90,
  spreadDeg = 1.6,
  seed = 11,
}: {
  center: [number, number];
  hubs?: number;
  storesPerHub?: number;
  spreadDeg?: number;
  seed?: number;
}): { hubs: Hub[]; stores: Store[] } {
  let state = seed;
  const rnd = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };

  const [lng, lat] = center;

  const hubList: Hub[] = Array.from({ length: hubs }, (_, index) => {
    // Gli hub su un anello attorno al centro, con un po' di disordine: una
    // disposizione regolare sembrerebbe finta, una casuale li accavallerebbe.
    const angle = (index / hubs) * Math.PI * 2 + rnd() * 0.6;
    const radius = spreadDeg * (0.35 + rnd() * 0.3);
    return {
      index,
      position: [
        lng + Math.cos(angle) * radius,
        lat + Math.sin(angle) * radius * 0.6,
      ] as [number, number],
    };
  });

  const stores: Store[] = [];
  for (const hub of hubList) {
    for (let i = 0; i < storesPerHub; i++) {
      const angle = rnd() * Math.PI * 2;
      const spread = spreadDeg * 0.42;
      const distance = Math.sqrt(rnd()) * spread;
      stores.push({
        position: [
          hub.position[0] + Math.cos(angle) * distance,
          hub.position[1] + Math.sin(angle) * distance * 0.6,
        ],
        hub: hub.index,
        // Il valore varia con continuita' nello spazio invece che a caso, cosi'
        // il rilievo ha zone alte e zone basse invece di rumore.
        value: Math.min(
          1,
          Math.max(
            0.05,
            0.5 +
              0.35 * Math.sin(hub.position[0] * 3 + angle) +
              0.25 * Math.cos(distance * 14),
          ),
        ),
        reach: distance / spread,
        volume: Math.min(
          1,
          Math.max(
            0.05,
            0.45 + 0.4 * Math.cos(angle * 2 + hub.index) + 0.25 * (1 - distance / spread),
          ),
        ),
      });
    }
  }

  return { hubs: hubList, stores };
}
