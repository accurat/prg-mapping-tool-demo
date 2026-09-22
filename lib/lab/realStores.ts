export type RealStore = {
  position: [number, number];
  storeId: string;
  /** 0..1 da comp_cvs — colore della colonna. */
  colorValue: number;
  /** 0..1 da comp_walgreens — altezza della colonna. */
  heightValue: number;
};

/** Spezza una riga CSV rispettando i campi tra virgolette. */
function splitCsvLine(line: string) {
  return line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map((cell) => {
    const trimmed = cell.trim();
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      return trimmed.slice(1, -1).replace(/""/g, '"');
    }
    return trimmed;
  });
}

function normalize(values: number[]) {
  const { min, max } = values.reduce(
    (acc, v) => ({
      min: v < acc.min ? v : acc.min,
      max: v > acc.max ? v : acc.max,
    }),
    { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY },
  );
  const span = max - min;
  if (!Number.isFinite(span) || span <= 0) {
    return values.map(() => 0.5);
  }
  return values.map((v) => (v - min) / span);
}

/**
 * Legge il CSV store Mapbox (lng, lat, metriche) e normalizza colore/altezza.
 *
 * Colore da `comp_cvs`, altezza da `comp_walgreens` — come i default di
 * mapSinglePoint nel meta, con la size del cerchio portata sull'altezza.
 */
export function parseStoresCsv(text: string): RealStore[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    return [];
  }

  const header = splitCsvLine(lines[0]);
  const indexOf = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) {
      throw new Error(`colonna mancante nel csv: ${name}`);
    }
    return i;
  };

  const iLng = indexOf("lng");
  const iLat = indexOf("lat");
  const iId = indexOf("store_id");
  const iColor = indexOf("comp_cvs");
  const iHeight = indexOf("comp_walgreens");

  const rows = lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    return {
      lng: Number(cells[iLng]),
      lat: Number(cells[iLat]),
      storeId: cells[iId] ?? "",
      colorRaw: Number(cells[iColor]),
      heightRaw: Number(cells[iHeight]),
    };
  });

  const valid = rows.filter(
    (row) =>
      Number.isFinite(row.lng) &&
      Number.isFinite(row.lat) &&
      Number.isFinite(row.colorRaw) &&
      Number.isFinite(row.heightRaw),
  );

  const colors = normalize(valid.map((row) => row.colorRaw));
  const heights = normalize(valid.map((row) => row.heightRaw));

  return valid.map((row, i) => ({
    position: [row.lng, row.lat] as [number, number],
    storeId: row.storeId,
    colorValue: colors[i],
    heightValue: heights[i],
  }));
}

export async function loadRealStores(url = "/data/stores-mapbox.csv") {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`impossibile caricare ${url}: ${res.status}`);
  }
  return parseStoresCsv(await res.text());
}
