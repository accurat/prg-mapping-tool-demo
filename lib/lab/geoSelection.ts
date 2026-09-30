/** Bounding box geografico (lng/lat). */
export type GeoBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export function boundsFromScreenBox(
  unproject: (p: {x: number; y: number}) => {lng: number; lat: number},
  start: {x: number; y: number},
  end: {x: number; y: number},
) {
  const a = unproject(start);
  const b = unproject(end);
  return {
    west: Math.min(a.lng, b.lng),
    east: Math.max(a.lng, b.lng),
    south: Math.min(a.lat, b.lat),
    north: Math.max(a.lat, b.lat),
  } satisfies GeoBounds;
}

export function positionInBounds(
  position: [number, number],
  bounds: GeoBounds,
) {
  const [lng, lat] = position;
  return (
    lng >= bounds.west &&
    lng <= bounds.east &&
    lat >= bounds.south &&
    lat <= bounds.north
  );
}

export function boundsToCorners(bounds: GeoBounds) {
  return [
    [bounds.west, bounds.south],
    [bounds.east, bounds.north],
  ] as [[number, number], [number, number]];
}

/** Etichetta Selection da stati dei punti catturati nel box. */
export function selectionLabelFromStates(stateNames: string[]) {
  const unique = Array.from(
    new Set(stateNames.map((s) => s.trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));

  if (unique.length === 0) {
    return "Selected area";
  }
  if (unique.length === 1) {
    return unique[0];
  }
  if (unique.length <= 3) {
    return unique.join(", ");
  }
  return `${unique.length} states`;
}
