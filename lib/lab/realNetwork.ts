export type NetworkLink = {
  id: string;
  source: [number, number];
  target: [number, number];
  /** 0..1 da Dollars */
  weight: number;
  dollars: number;
  cases: number;
  units: number;
};

export type NetworkNode = {
  position: [number, number];
  role: "source" | "target";
  routeCount: number;
  storeId: string | null;
};

type GeoJsonFeature = {
  type: string;
  geometry: {
    type: string;
    coordinates: number[] | number[][];
  };
  properties: Record<string, unknown>;
};

type GeoJson = {
  type: string;
  features: GeoJsonFeature[];
};

function asNumber(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
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

function parseLinks(geo: GeoJson): NetworkLink[] {
  const rows = geo.features
    .filter((f) => f.geometry?.type === "LineString")
    .map((f) => {
      const coords = f.geometry.coordinates as number[][];
      const source = coords[0] as [number, number];
      const target = coords[coords.length - 1] as [number, number];
      return {
        id: String(f.properties.route_id ?? ""),
        source,
        target,
        dollars: asNumber(f.properties.Dollars),
        cases: asNumber(f.properties.Cases),
        units: asNumber(f.properties.Units),
        weight: 0,
      };
    })
    .filter(
      (row) =>
        Number.isFinite(row.source[0]) &&
        Number.isFinite(row.source[1]) &&
        Number.isFinite(row.target[0]) &&
        Number.isFinite(row.target[1]),
    );

  const weights = normalize(rows.map((row) => row.dollars));
  return rows.map((row, i) => ({ ...row, weight: weights[i] }));
}

function parseNodes(geo: GeoJson): NetworkNode[] {
  return geo.features
    .filter((f) => f.geometry?.type === "Point")
    .map((f) => {
      const coords = f.geometry.coordinates as number[];
      const role: "source" | "target" =
        f.properties.type === "source" ? "source" : "target";
      return {
        position: [coords[0], coords[1]] as [number, number],
        role,
        routeCount: asNumber(f.properties.route_count),
        storeId:
          typeof f.properties.store_id === "string" ? f.properties.store_id : null,
      };
    })
    .filter((n) => Number.isFinite(n.position[0]) && Number.isFinite(n.position[1]));
}

export async function loadRealNetwork({
  linksUrl = "/data/network-links-mapbox.geojson",
  nodesUrl = "/data/network-nodes-mapbox.geojson",
} = {}) {
  const [linksRes, nodesRes] = await Promise.all([fetch(linksUrl), fetch(nodesUrl)]);
  if (!linksRes.ok) {
    throw new Error(`impossibile caricare ${linksUrl}: ${linksRes.status}`);
  }
  if (!nodesRes.ok) {
    throw new Error(`impossibile caricare ${nodesUrl}: ${nodesRes.status}`);
  }
  const [linksGeo, nodesGeo] = await Promise.all([
    linksRes.json() as Promise<GeoJson>,
    nodesRes.json() as Promise<GeoJson>,
  ]);
  return {
    links: parseLinks(linksGeo),
    nodes: parseNodes(nodesGeo),
  };
}
