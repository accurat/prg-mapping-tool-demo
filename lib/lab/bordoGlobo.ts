/**
 * Bordo del globo nello spazio di lavoro di deck.gl (raggio 256).
 *
 * Serve all'alone SVG: i punti tangenti camera→sfera, proiettati a schermo.
 * Estratto dalla regia del tour perche' P0 (e altre viste a globo) lo riusano.
 */

export const RAGGIO_DECK = 256;

export type VistaDeck = {
  cameraPosition: number[];
  zoom: number;
  unprojectPosition: (p: number[]) => number[];
  project: (p: number[]) => number[];
};

/**
 * Il bordo del globo come lo vede la camera, in gradi.
 *
 * Cerchio dei punti in cui lo sguardo e' tangente alla sfera: vale a
 * qualunque inclinazione — a camera inclinata il globo non e' un disco
 * centrato, e un anello fisso sullo schermo fallirebbe.
 */
export function bordoDelGlobo(v: VistaDeck, punti = 160): [number, number][] | null {
  const c = v.cameraPosition;
  const d = Math.hypot(c[0], c[1], c[2]);
  if (!(d > RAGGIO_DECK * 1.0005)) return null;
  const u = c.map((x) => x / d);
  const angolo = Math.acos(RAGGIO_DECK / d);
  const coseno = Math.cos(angolo);
  const seno = Math.sin(angolo);

  const aiuto = Math.abs(u[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const vettoriale = (a: number[], b: number[]) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const grezzo = vettoriale(u, aiuto);
  const n = Math.hypot(grezzo[0], grezzo[1], grezzo[2]);
  const e1 = grezzo.map((x) => x / n);
  const e2 = vettoriale(u, e1);

  const fuori: [number, number][] = [];
  for (let k = 0; k <= punti; k++) {
    const f = (k / punti) * Math.PI * 2;
    const p = [0, 1, 2].map(
      (i) => RAGGIO_DECK * (coseno * u[i] + seno * (Math.cos(f) * e1[i] + Math.sin(f) * e2[i])),
    );
    const [lng, lat] = v.unprojectPosition(p);
    const prima = fuori[fuori.length - 1];
    let continua = lng;
    if (prima) while (continua - prima[0] > 180) continua -= 360;
    if (prima) while (continua - prima[0] < -180) continua += 360;
    fuori.push([continua, lat]);
  }
  return fuori;
}

/**
 * Intensita' dell'alone in funzione dello zoom: si spegne scendendo di quota,
 * dove il bordo diventa l'orizzonte e il cielo della mappa basta.
 */
export function intensitaAlone(zoom: number, base = 1): number {
  return Math.max(0, Math.min(1, base * ((6.2 - zoom) / 1.6)));
}

/** Legge bordo + intensita' dalla vista deck nascosta nell'overlay MapLibre. */
export function leggiBordoDaOverlay(
  overlay: { _deck?: { getViewports: () => VistaDeck[] } } | null,
  base = 1,
): { punti: [number, number][]; intensita: number } | null {
  const vista = overlay?._deck?.getViewports()[0];
  if (!vista) return null;
  const intensita = intensitaAlone(vista.zoom, base);
  if (intensita <= 0.002) return null;
  const bordo = bordoDelGlobo(vista);
  if (!bordo) return null;
  return {
    intensita,
    punti: bordo.map(([lng, lat]) => {
      const [x, y] = vista.project([lng, lat, 0]);
      return [x, y] as [number, number];
    }),
  };
}
