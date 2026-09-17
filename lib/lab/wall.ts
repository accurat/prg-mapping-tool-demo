/**
 * Geometria fisica del muro, per ragionare in millimetri invece che in pixel.
 *
 * Il muro dell'Innovation Center e' largo circa sei metri e alto circa 1,13 per
 * 5760x1080 pixel: ne discende che **un pixel vale circa un millimetro**. E'
 * l'unica conversione che serve per capire se qualcosa si vedra' da lontano.
 */
export const WALL_WIDTH_PX = 5760;
export const WALL_WIDTH_MM = 6000;
export const MM_PER_PX = WALL_WIDTH_MM / WALL_WIDTH_PX;

/** Distanza tipica di chi guarda, in millimetri. */
export const VIEWING_DISTANCE_MM = 12000;

/** Quanti minuti d'arco occupa, per chi guarda, un oggetto di N pixel. */
export function arcMinutes(px: number, distanceMm = VIEWING_DISTANCE_MM): number {
  const mm = px * MM_PER_PX;
  return (Math.atan(mm / distanceMm) * 180 * 60) / Math.PI;
}

/**
 * Giudizio sulla visibilita' a una data distanza.
 *
 * Un occhio normale distingue due dettagli separati da circa un minuto d'arco.
 * Sotto quella soglia le cose non si confondono: **spariscono**. Per il testo
 * serve molto di piu': una lettera leggibile senza sforzo occupa una decina di
 * minuti d'arco in altezza.
 */
export function legibility(px: number): {
  arcmin: number;
  mm: number;
  verdict: "invisibile" | "al limite" | "visibile" | "comodo";
} {
  const arcmin = arcMinutes(px);
  const mm = px * MM_PER_PX;
  const verdict =
    arcmin < 1 ? "invisibile" : arcmin < 3 ? "al limite" : arcmin < 10 ? "visibile" : "comodo";
  return { arcmin, mm, verdict };
}
