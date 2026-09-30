/**
 * Demographics P0: indici centrati a 100 (come Shopper Trait), bucket 90/100/110.
 */

export type DemoColumn = {
  id: string;
  label: string;
  category: string;
};

export type DemoCategory = {
  id: string;
  columns: DemoColumn[];
};

/** Soglie fisse Shopper Trait: sotto 100 = under-index, sopra = over-index. */
export const DEMO_BUCKETS = {
  names: ["Lowest", "Lower", "Higher", "Highest"] as const,
  /** [0, 90, 100, 110] — l'ultimo bucket e' 110+. */
  domains: [0, 90, 100, 110] as const,
  colors: ["#4F01E9", "#9106D6", "#FC4BFF", "#F4095F"] as const,
  /** opacita' 50% sulle colonne mappa. */
  alpha: 128,
};

export type DemoBucketName = (typeof DEMO_BUCKETS.names)[number];

export type DemoIndexPoint = {
  storeId: string;
  position: [number, number];
  /** indice grezzo della metrica (baseline 100). */
  index: number;
  bucket: number;
};

export type DemoBucketRecap = {
  name: DemoBucketName;
  color: string;
  /** quota 0..1 di store in questo bucket. */
  share: number;
  count: number;
};

export type DemoMetricSummary = {
  avg: number;
  min: number;
  max: number;
  buckets: DemoBucketRecap[];
};

function splitTsvLine(line: string) {
  return line.split("\t");
}

export function parseDemographicsGlossary(text: string): DemoCategory[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return [];

  const header = splitTsvLine(lines[0]);
  const iCol = header.indexOf("column");
  const iLabel = header.indexOf("label");
  const iCat = header.indexOf("category");
  const iGroup = header.indexOf("group");
  if ([iCol, iLabel, iCat, iGroup].some((i) => i < 0)) {
    throw new Error("glossary demographics: colonne mancanti");
  }

  const byCat = new Map<string, DemoColumn[]>();
  for (const line of lines.slice(1)) {
    const cells = splitTsvLine(line);
    if (cells[iGroup] !== "Demographics") continue;
    const category = (cells[iCat] ?? "").trim();
    if (!category) continue;
    const id = cells[iCol];
    const label = (cells[iLabel] ?? "").trim() || id;
    const list = byCat.get(category) ?? [];
    list.push({ id, label, category });
    byCat.set(category, list);
  }

  return Array.from(byCat.entries()).map(([id, columns]) => ({ id, columns }));
}

export type DemoTable = {
  byStore: Map<string, Record<string, number>>;
  categories: DemoCategory[];
};

export function parseDemographicsTable(
  text: string,
  categories: DemoCategory[],
): Map<string, Record<string, number>> {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return new Map();

  const header = splitTsvLine(lines[0]);
  const iId = header.indexOf("store_id");
  if (iId < 0) throw new Error("demographics: manca store_id");

  const colIds = categories.flatMap((c) => c.columns.map((col) => col.id));
  const indices = new Map(
    colIds.map((id) => {
      const i = header.indexOf(id);
      if (i < 0) throw new Error(`demographics: colonna mancante ${id}`);
      return [id, i] as const;
    }),
  );

  const byStore = new Map<string, Record<string, number>>();
  for (const line of lines.slice(1)) {
    const cells = splitTsvLine(line);
    const storeId = cells[iId];
    if (!storeId) continue;
    const values: Record<string, number> = {};
    for (const [id, i] of indices) {
      const n = Number(cells[i]);
      values[id] = Number.isFinite(n) ? n : 0;
    }
    byStore.set(storeId, values);
  }
  return byStore;
}

export async function loadDemographics(): Promise<DemoTable> {
  const [glossRes, dataRes] = await Promise.all([
    fetch("/data/dataset_glossary.tsv.txt"),
    fetch("/data/stores-demographics.tsv"),
  ]);
  if (!glossRes.ok) throw new Error(`glossary: ${glossRes.status}`);
  if (!dataRes.ok) throw new Error(`demographics: ${dataRes.status}`);
  const categories = parseDemographicsGlossary(await glossRes.text());
  const byStore = parseDemographicsTable(await dataRes.text(), categories);
  return { byStore, categories };
}

/** Bucket 0..3 da soglie 90 / 100 / 110. */
export function bucketForIndex(index: number): number {
  const [, a, b, c] = DEMO_BUCKETS.domains;
  if (index < a) return 0;
  if (index < b) return 1;
  if (index < c) return 2;
  return 3;
}

export function bucketColor(bucket: number): [number, number, number, number] {
  const hex = DEMO_BUCKETS.colors[Math.max(0, Math.min(3, bucket))];
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return [r, g, b, DEMO_BUCKETS.alpha];
}

export function buildDemoPoints(
  stores: { storeId: string; position: [number, number] }[],
  byStore: Map<string, Record<string, number>>,
  columnId: string,
): DemoIndexPoint[] {
  return stores.map((store) => {
    const index = byStore.get(store.storeId)?.[columnId] ?? 0;
    return {
      storeId: store.storeId,
      position: store.position,
      index,
      bucket: bucketForIndex(index),
    };
  });
}

/** Distribuzione USA della metrica: avg/min/max + quote per bucket. */
export function usaMetricSummary(
  byStore: Map<string, Record<string, number>>,
  storeIds: string[],
  columnId: string,
): DemoMetricSummary {
  const values: number[] = [];
  for (const id of storeIds) {
    const v = byStore.get(id)?.[columnId];
    if (v !== undefined && Number.isFinite(v)) values.push(v);
  }

  const empty: DemoMetricSummary = {
    avg: 0,
    min: 0,
    max: 0,
    buckets: DEMO_BUCKETS.names.map((name, i) => ({
      name,
      color: DEMO_BUCKETS.colors[i],
      share: 0,
      count: 0,
    })),
  };
  if (!values.length) return empty;

  const counts = [0, 0, 0, 0];
  let sum = 0;
  let min = values[0];
  let max = values[0];
  for (const v of values) {
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
    counts[bucketForIndex(v)] += 1;
  }
  const n = values.length;
  return {
    avg: sum / n,
    min,
    max,
    buckets: DEMO_BUCKETS.names.map((name, i) => ({
      name,
      color: DEMO_BUCKETS.colors[i],
      share: counts[i] / n,
      count: counts[i],
    })),
  };
}
