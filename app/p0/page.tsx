"use client";

import {
  AmbientLight,
  ColumnLayer,
  DirectionalLight,
  LightingEffect,
  MapLibreOverlay,
  PathLayer,
  ScatterplotLayer,
} from "deck.gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Hud, HudPanel, Row, fpsTone } from "@/components/lab/Hud";
import { P0ContextPanel, type ContextStat } from "@/components/lab/P0ContextPanel";
import {
  P0NavMenu,
  type P0DataMode,
  type P0MapView,
} from "@/components/lab/P0NavMenu";
import { P0ViewsPanel, type P0StoryView } from "@/components/lab/P0ViewsPanel";
import { MapSurface, type MapHandle } from "@/components/lab/MapSurface";
import { Stage } from "@/components/lab/Stage";
import { AloneGlobo } from "@/components/tour/AloneGlobo";
import { leggiBordoDaOverlay } from "@/lib/lab/bordoGlobo";
import {
  buildDemoPoints,
  bucketColor,
  loadDemographics,
  usaMetricSummary,
  type DemoIndexPoint,
  type DemoTable,
} from "@/lib/lab/demographics";
import { under } from "@/lib/lab/map";
import {
  boundsToCorners,
  positionInBounds,
  selectionLabelFromStates,
  type GeoBounds,
} from "@/lib/lab/geoSelection";
import { loadRealNetwork, type NetworkLink, type NetworkNode } from "@/lib/lab/realNetwork";
import { loadRealStores, type RealStore } from "@/lib/lab/realStores";
import {
  CIRCLE_UNION_FILL_PARAMETERS,
  CIRCLE_UNION_RIM_PARAMETERS,
  UnionFillScatterplotLayer,
  strokePadMeters,
} from "@/lib/lab/UnionScatterplotLayer";
import { useFrameMeter } from "@/lib/lab/useFrameMeter";
import { useRenderTrust } from "@/lib/lab/useRenderTrust";
import { conta, valuta } from "@/lib/format";

const WIDTH = 5760;
const HEIGHT = 1080;
/**
 * Centro USA: latitudine moderata cosi' con pitch il sud resta in quadro.
 */
const TARGET: [number, number] = [-97.5, 37.5];
const STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

/**
 * Zoom iniziale del globo: abbastanza alto da riempire quasi tutta l'altezza
 * del muro 5760x1080.
 */
const START_ZOOM = 2.75;
/** Arrivo piu' stretto sugli contiguous US. */
const ARRIVAL_ZOOM = 5.1;
const ARRIVAL_PITCH = 55;
/**
 * Padding inferiore (px): sposta il vanishing point in alto nel viewport.
 * L'`offset` di jumpTo non fa questo — serve proprio padding/setPadding.
 */
const VIEW_PAD_BOTTOM = 520;

/** Altezza massima delle colonne (metri) all'arrivo. */
const DATA_HEIGHT_M = 90000;
/** Raggio colonna in metri (vista globo / barre 3d). */
const COLUMN_RADIUS_M = 12000;
/**
 * Cerchi in vista mappa: raggio min/max in metri (diametro 4–35 km).
 * Mapping sqrt sulla metrica (ex altezza) per comprimere i grandi valori
 * e ridure l'overlap rispetto al raggio fisso da 12 km delle colonne.
 */
const CIRCLE_RADIUS_MIN_M = 2000;
const CIRCLE_RADIUS_MAX_M = 17500;
/** Fill cerchi 2d a meta' opacita'; stroke pieno dello stesso colore. */
const CIRCLE_FILL_ALPHA = 128;
const CIRCLE_STROKE_ALPHA = 255;
/** Spessore del bordo esterno della union, in pixel schermo. */
const CIRCLE_STROKE_PX = 2;
/** Durata inclinazione pitch globo ↔ mappa. */
const VIEW_TILT_MS = 600;
/** Durata morph barre ↔ cerchi dopo il tilt. */
const FLAT_MORPH_MS = 750;

/** Velocita' di rotazione sul proprio asse (gradi di longitudine al secondo). */
const ORBIT_DEG_PER_S = 8;
/** Latitudine di riposo: leggermente a nord per inquadrare meglio i continenti. */
const ORBIT_LAT = 20;

type Phase = "orbita" | "discesa" | "colonne" | "navigabile";

const PHASE_LABEL: Record<Phase, string> = {
  orbita: "globo in orbita",
  discesa: "discesa sugli USA",
  colonne: "i negozi emergono",
  navigabile: "mappa navigabile",
};

/**
 * Illuminazione uniforme: ombre e luce laterale a overview continentale
 * tagliano gli Stati Uniti a meta' (ovest chiaro, est nero).
 */
function makeLighting() {
  return new LightingEffect({
    ambient: new AmbientLight({ color: [255, 255, 255], intensity: 2.4 }),
    sun: new DirectionalLight({
      color: [255, 255, 255],
      intensity: 0.55,
      direction: [0, -1, -0.35],
      _shadow: false,
    }),
  });
}

const LIGHT = makeLighting();

/** Scala colonne: bassi #28218E → alti #35778E. */
const COLOR_LOW: [number, number, number] = [0x28, 0x21, 0x8e];
const COLOR_HIGH: [number, number, number] = [0x35, 0x77, 0x8e];

function valueColor(t: number, alpha = 235): [number, number, number, number] {
  const u = Math.max(0, Math.min(1, t));
  return [
    COLOR_LOW[0] + (COLOR_HIGH[0] - COLOR_LOW[0]) * u,
    COLOR_LOW[1] + (COLOR_HIGH[1] - COLOR_LOW[1]) * u,
    COLOR_LOW[2] + (COLOR_HIGH[2] - COLOR_LOW[2]) * u,
    alpha,
  ];
}

/** Raggio cerchio (metri) dalla metrica 0..1 ex altezza; sqrt per meno overlap. */
function circleRadiusM(value01: number) {
  const u = Math.max(0, Math.min(1, value01));
  return (
    CIRCLE_RADIUS_MIN_M +
    Math.sqrt(u) * (CIRCLE_RADIUS_MAX_M - CIRCLE_RADIUS_MIN_M)
  );
}

function easeInOutCubic(t: number) {
  return t * t * (3 - 2 * t);
}

/** Interpola longitudine sul percorso piu' corto (gestisce l'antimeridiano). */
function lerpLng(from: number, to: number, t: number) {
  let delta = to - from;
  if (delta > 180) {
    delta -= 360;
  }
  if (delta < -180) {
    delta += 360;
  }
  return from + delta * t;
}

/**
 * Profilo di altezza dell'arco (superellisse): sotto vista globo l'ArcLayer
 * non disegna, i percorsi si'.
 */
function archProfile(t: number) {
  const EXPONENT = 2.05;
  const x = Math.abs(t * 2 - 1);
  return Math.pow(Math.max(0, 1 - Math.pow(x, EXPONENT)), 1 / EXPONENT);
}

type NetworkPath = {
  path: [number, number, number][];
  weight: number;
};

function linkToPath(link: NetworkLink, samples = 28): NetworkPath {
  const apex = 140_000 * (0.4 + link.weight * 0.6);
  const path = Array.from({ length: samples }, (_, s) => {
    const t = samples === 1 ? 0 : s / (samples - 1);
    const lng = link.source[0] + (link.target[0] - link.source[0]) * t;
    const lat = link.source[1] + (link.target[1] - link.source[1]) * t;
    return [lng, lat, archProfile(t) * apex] as [number, number, number];
  });
  return { path, weight: link.weight };
}

export default function P0Page() {
  const [map, setMap] = useState<MapHandle | null>(null);
  const [phase, setPhase] = useState<Phase>("orbita");
  const [labelId, setLabelId] = useState<string | undefined>();
  const [stores, setStores] = useState<RealStore[] | null>(null);
  const [network, setNetwork] = useState<{
    links: NetworkLink[];
    nodes: NetworkNode[];
  } | null>(null);
  const [dataMode, setDataMode] = useState<P0DataMode>("stores");
  const [mapView, setMapView] = useState<P0MapView>("globe");
  const [viewsOpen, setViewsOpen] = useState(false);
  const [activeStory, setActiveStory] = useState<P0StoryView | null>(null);
  const [demoTable, setDemoTable] = useState<DemoTable | null>(null);
  const [demoCategoryId, setDemoCategoryId] = useState("Generation");
  const [demoColumnId, setDemoColumnId] = useState("age_millenials");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState<{
    label: string;
    bounds: GeoBounds;
  } | null>(null);

  const overlayRef = useRef<MapLibreOverlay | null>(null);
  const runId = useRef(0);
  const spinning = useRef(false);
  const spinRaf = useRef(0);
  /** Intensita' base dell'alone: acceso subito, senza fade-in. */
  const aloneRef = useRef(1);
  /** 0 = barre 3d, 1 = cerchi piatti (metrica su diametro). */
  const flatnessRef = useRef(0);
  const viewGenRef = useRef(0);
  const morphRafRef = useRef(0);

  const { stats } = useFrameMeter();
  const trust = useRenderTrust(stats.medianMs);

  const demoCategory = useMemo(
    () => demoTable?.categories.find((c) => c.id === demoCategoryId) ?? null,
    [demoTable, demoCategoryId],
  );

  const demoColumn = useMemo(
    () => demoCategory?.columns.find((c) => c.id === demoColumnId) ?? null,
    [demoCategory, demoColumnId],
  );

  const exploringDemo = activeStory === "Explore demographics";

  const selectedStores = useMemo(() => {
    const list = stores ?? [];
    if (!selection) {
      return list;
    }
    return list.filter((store) =>
      positionInBounds(store.position, selection.bounds),
    );
  }, [stores, selection]);

  const selectionLabel = selection?.label ?? "United States";

  const demoRecap = useMemo(() => {
    if (!demoTable || !demoColumnId) return null;
    return usaMetricSummary(
      demoTable.byStore,
      selectedStores.map((s) => s.storeId),
      demoColumnId,
    );
  }, [demoTable, selectedStores, demoColumnId]);

  /** Aggregati della selezione corrente (USA intera o box Shift+drag). */
  const contextStats = useMemo((): ContextStat[] => {
    if (exploringDemo && demoTable && demoColumnId) {
      const recap = usaMetricSummary(
        demoTable.byStore,
        selectedStores.map((s) => s.storeId),
        demoColumnId,
      );
      const top = recap.buckets.reduce(
        (best, b) => (b.share > best.share ? b : best),
        recap.buckets[0],
      );
      return [
        { label: "Selection", value: selectionLabel },
        { label: "Metric", value: demoColumn?.label ?? "—" },
        { label: "Avg index", value: recap.avg.toFixed(0) },
        { label: "Top bucket", value: top?.name ?? "—" },
      ];
    }

    if (dataMode === "network") {
      const links = network?.links ?? [];
      const nodes = network?.nodes ?? [];
      const inSel = selection
        ? {
            nodes: nodes.filter((n) =>
              positionInBounds(n.position, selection.bounds),
            ),
            links: links.filter(
              (link) =>
                positionInBounds(link.source, selection.bounds) ||
                positionInBounds(link.target, selection.bounds),
            ),
          }
        : { nodes, links };
      const dollars = inSel.links.reduce((sum, link) => sum + link.dollars, 0);
      return [
        { label: "Selection", value: selectionLabel },
        { label: "Links", value: conta(inSel.links.length) },
        { label: "Nodes", value: conta(inSel.nodes.length) },
        { label: "Total dollars", value: valuta(dollars) },
      ];
    }

    const sales = selectedStores.reduce((sum, store) => sum + store.salesUsd, 0);
    const states = new Set(
      selectedStores.map((store) => store.stateName).filter(Boolean),
    );
    return [
      { label: "Selection", value: selectionLabel },
      { label: "Stores", value: conta(selectedStores.length) },
      { label: "Total sales", value: valuta(sales) },
      { label: "States", value: conta(states.size) },
    ];
  }, [
    exploringDemo,
    demoTable,
    demoColumnId,
    demoColumn,
    dataMode,
    selectedStores,
    selectionLabel,
    selection,
    network,
  ]);

  const viewTitle = exploringDemo
    ? `Demographics · ${demoColumn?.label ?? "…"}`
    : dataMode === "network"
      ? "Supply network"
      : "Store competitive density";

  useEffect(() => {
    let cancelled = false;
    void loadRealStores()
      .then((data) => {
        if (!cancelled) {
          setStores(data);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "errore di caricamento");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleReady = useCallback((m: MapHandle) => {
    m.jumpTo({ center: [TARGET[0], ORBIT_LAT], zoom: START_ZOOM, pitch: 0, bearing: 0 });
    // allinea il vuoto attorno al globo allo sfondo di pagina
    try {
      m.setPaintProperty("background", "background-color", "#171A2D");
    } catch {
      // stile senza layer background: ignora
    }
    const layers = m.getStyle().layers ?? [];
    // niente toponimi a overview/globo: a questa scala sono solo rumore
    layers
      .filter((l) => l.type === "symbol")
      .forEach((l) => {
        m.setLayoutProperty(l.id, "visibility", "none");
      });
    setLabelId(layers.find((l) => l.type === "symbol")?.id);
    setMap(m);
  }, []);

  useEffect(() => {
    if (!map) {
      return;
    }
    // overlaid: canvas deck dedicato con stencil proprio — serve all'union
    // dei cerchi 2d (in interleaved lo stencil e' di MapLibre e si rompe).
    const overlay = new MapLibreOverlay({
      interleaved: false,
      useDevicePixels: false,
      deviceProps: {
        webgl: { stencil: true, alpha: true, antialias: false },
      },
      layers: [],
      effects: [LIGHT],
    });
    map.addControl(overlay);
    overlayRef.current = overlay;

    return () => {
      overlayRef.current = null;
      map.removeControl(overlay);
    };
  }, [map]);

  const bordoGlobo = useCallback(() => {
    // in vista mappa piatta l'alone non ha senso
    if (mapView !== "globe") {
      return null;
    }
    return leggiBordoDaOverlay(
      overlayRef.current as unknown as Parameters<typeof leggiBordoDaOverlay>[0],
      aloneRef.current,
    );
  }, [mapView]);

  const stopSpin = useCallback(() => {
    spinning.current = false;
    if (spinRaf.current) {
      cancelAnimationFrame(spinRaf.current);
      spinRaf.current = 0;
    }
  }, []);

  const startSpin = useCallback(
    (m: MapHandle) => {
      stopSpin();
      spinning.current = true;
      // camera fissa nello spazio: pitch/bearing a zero, gira solo la longitudine
      m.jumpTo({
        center: [m.getCenter().lng, ORBIT_LAT],
        zoom: START_ZOOM,
        pitch: 0,
        bearing: 0,
      });
      const origin = performance.now();
      const baseLng = m.getCenter().lng;
      const step = (now: number) => {
        if (!spinning.current) {
          return;
        }
        // terra: ovest → est; da camera fissa la faccia centrale scorre verso ovest
        const raw = baseLng - ((now - origin) / 1000) * ORBIT_DEG_PER_S;
        const lng = ((((raw + 180) % 360) + 360) % 360) - 180;
        m.setCenter([lng, ORBIT_LAT]);
        spinRaf.current = requestAnimationFrame(step);
      };
      spinRaf.current = requestAnimationFrame(step);
    },
    [stopSpin],
  );

  useEffect(() => () => stopSpin(), [stopSpin]);

  const drawStores = useCallback(
    (rise: number, data: RealStore[], flat = flatnessRef.current) => {
      const overlay = overlayRef.current;
      if (!overlay) {
        return;
      }

      const ease = easeInOutCubic(rise);
      // id diverso per vista: deck.gl altrimenti tiene il clip circolare del globo
      const viewKey = mapView === "globe" ? "globe" : "map";
      const colFade = (1 - flat) * ease;
      const discFade = flat * ease;
      const padM = map
        ? strokePadMeters(map.getZoom(), map.getCenter().lat, CIRCLE_STROKE_PX)
        : 800;
      // first-wins: disegna prima i valori alti (piu' chiari) cosi' restano sopra
      const discs = data.slice().sort((a, b) => b.colorValue - a.colorValue);
      const discRadius = (d: RealStore) => {
        const target = circleRadiusM(d.heightValue);
        return COLUMN_RADIUS_M * (1 - flat) + target * flat;
      };

      overlay.setProps({
        layers: [
          new ColumnLayer<RealStore>({
            id: `negozi-col-${viewKey}`,
            data,
            visible: flat < 0.999,
            // 12 lati: base circolare (6 = esagono)
            diskResolution: 12,
            radius: COLUMN_RADIUS_M,
            extruded: true,
            // senza materiale il colore del dato non viene oscurato dal lighting
            material: false,
            getPosition: (d) => d.position,
            getElevation: (d) => d.heightValue * DATA_HEIGHT_M * ease * (1 - flat),
            getFillColor: (d) => {
              const c = valueColor(d.colorValue);
              return [c[0], c[1], c[2], c[3] * colFade];
            },
            updateTriggers: {
              getElevation: [rise, flat],
              getFillColor: [rise, flat],
            },
            ...under(labelId),
          }),
          // 1) union "grassa" colore stroke → 2) fill sostituisce l'interno
          //    resta solo l'anello esterno della union (niente stroke interni)
          new UnionFillScatterplotLayer<RealStore>({
            id: `negozi-rim-${viewKey}`,
            data: discs,
            visible: flat > 0.001,
            stroked: false,
            filled: true,
            parameters: CIRCLE_UNION_RIM_PARAMETERS,
            getPosition: (d) => d.position,
            radiusUnits: "meters",
            getRadius: (d) => discRadius(d) + padM,
            getFillColor: (d) => {
              const c = valueColor(d.colorValue, CIRCLE_STROKE_ALPHA);
              return [c[0], c[1], c[2], c[3] * discFade];
            },
            updateTriggers: {
              getRadius: [flat, padM],
              getFillColor: [rise, flat],
            },
          }),
          new UnionFillScatterplotLayer<RealStore>({
            id: `negozi-fill-${viewKey}`,
            data: discs,
            visible: flat > 0.001,
            stroked: false,
            filled: true,
            parameters: CIRCLE_UNION_FILL_PARAMETERS,
            getPosition: (d) => d.position,
            radiusUnits: "meters",
            getRadius: (d) => discRadius(d),
            // premoltiplicato: blend one/zero su canvas premultiplied
            getFillColor: (d) => {
              const c = valueColor(d.colorValue, CIRCLE_FILL_ALPHA);
              const a = (c[3] * discFade) / 255;
              return [c[0] * a, c[1] * a, c[2] * a, c[3] * discFade];
            },
            updateTriggers: {
              getRadius: flat,
              getFillColor: [rise, flat],
            },
          }),
        ],
        effects: [LIGHT],
      });
    },
    [labelId, mapView, map],
  );

  /** Colonne = indice della metrica per store; colore = bucket Lowest→Highest. */
  const drawDemographics = useCallback(
    (points: DemoIndexPoint[], flat = flatnessRef.current) => {
      const overlay = overlayRef.current;
      if (!overlay) {
        return;
      }
      const viewKey = mapView === "globe" ? "globe" : "map";
      // altezza: indice 100 ≈ meta' DATA_HEIGHT; clamp a 200
      const INDEX_REF = 200;
      const metric01 = (d: DemoIndexPoint) =>
        Math.min(Math.max(d.index, 0), INDEX_REF) / INDEX_REF;
      const colFade = 1 - flat;
      const discFade = flat;
      const padM = map
        ? strokePadMeters(map.getZoom(), map.getCenter().lat, CIRCLE_STROKE_PX)
        : 800;
      const discRadius = (d: DemoIndexPoint) => {
        const target = circleRadiusM(metric01(d));
        return COLUMN_RADIUS_M * (1 - flat) + target * flat;
      };

      overlay.setProps({
        layers: [
          new ColumnLayer<DemoIndexPoint>({
            id: `demo-col-${viewKey}-${demoColumnId}`,
            data: points,
            visible: flat < 0.999,
            diskResolution: 12,
            radius: COLUMN_RADIUS_M,
            extruded: true,
            material: false,
            getPosition: (d) => d.position,
            getElevation: (d) => metric01(d) * DATA_HEIGHT_M * (1 - flat),
            getFillColor: (d) => {
              const c = bucketColor(d.bucket);
              return [c[0], c[1], c[2], c[3] * colFade];
            },
            updateTriggers: {
              getElevation: [demoColumnId, flat],
              getFillColor: [demoColumnId, flat],
            },
            ...under(labelId),
          }),
          new UnionFillScatterplotLayer<DemoIndexPoint>({
            id: `demo-rim-${viewKey}-${demoColumnId}`,
            data: points,
            visible: flat > 0.001,
            stroked: false,
            filled: true,
            parameters: CIRCLE_UNION_RIM_PARAMETERS,
            getPosition: (d) => d.position,
            radiusUnits: "meters",
            getRadius: (d) => discRadius(d) + padM,
            getFillColor: (d) => {
              const c = bucketColor(d.bucket);
              return [c[0], c[1], c[2], CIRCLE_STROKE_ALPHA * discFade];
            },
            updateTriggers: {
              getRadius: [demoColumnId, flat, padM],
              getFillColor: [demoColumnId, flat],
            },
          }),
          new UnionFillScatterplotLayer<DemoIndexPoint>({
            id: `demo-fill-${viewKey}-${demoColumnId}`,
            data: points,
            visible: flat > 0.001,
            stroked: false,
            filled: true,
            parameters: CIRCLE_UNION_FILL_PARAMETERS,
            getPosition: (d) => d.position,
            radiusUnits: "meters",
            getRadius: (d) => discRadius(d),
            getFillColor: (d) => {
              const c = bucketColor(d.bucket);
              const alpha = CIRCLE_FILL_ALPHA * discFade;
              const a = alpha / 255;
              return [c[0] * a, c[1] * a, c[2] * a, alpha];
            },
            updateTriggers: {
              getRadius: [demoColumnId, flat],
              getFillColor: [demoColumnId, flat],
            },
          }),
        ],
        effects: [LIGHT],
      });
    },
    [labelId, mapView, demoColumnId, map],
  );

  /** Rete archi/nodi: PathLayer funziona sia su globo sia su mercator. */
  const drawNetwork = useCallback(
    (links: NetworkLink[], nodes: NetworkNode[]) => {
      const overlay = overlayRef.current;
      if (!overlay) {
        return;
      }

      const paths = links.map((link) => linkToPath(link));
      const viewKey = mapView === "globe" ? "globe" : "map";

      overlay.setProps({
        layers: [
          new PathLayer<NetworkPath>({
            id: `network-archi-${viewKey}`,
            data: paths,
            getPath: (d) => d.path,
            getColor: (d) => {
              const c = valueColor(d.weight);
              return [c[0], c[1], c[2], 200];
            },
            widthUnits: "pixels",
            getWidth: 3,
            jointRounded: true,
            capRounded: true,
            ...under(labelId),
          }),
          new ScatterplotLayer<NetworkNode>({
            id: `network-nodi-${viewKey}`,
            data: nodes,
            getPosition: (d) => d.position,
            radiusUnits: "pixels",
            getRadius: (d) => (d.role === "source" ? 7 : 4),
            getFillColor: (d) =>
              d.role === "source" ? [80, 235, 200, 240] : [255, 170, 90, 220],
            ...under(labelId),
          }),
        ],
        effects: [LIGHT],
      });
    },
    [labelId, mapView],
  );

  const clearLayers = useCallback(() => {
    overlayRef.current?.setProps({ layers: [], effects: [LIGHT] });
  }, []);

  const cancelFlatMorph = useCallback(() => {
    if (morphRafRef.current) {
      cancelAnimationFrame(morphRafRef.current);
      morphRafRef.current = 0;
    }
  }, []);

  /** Ridisegna store/demo alla flatness data (network ignorato). */
  const paintFlatColumns = useCallback(
    (flat: number) => {
      if (activeStory === "Explore demographics" && demoTable && demoColumnId) {
        const points = buildDemoPoints(
          selectedStores,
          demoTable.byStore,
          demoColumnId,
        );
        drawDemographics(points, flat);
        return;
      }
      if (dataMode === "stores") {
        drawStores(1, selectedStores, flat);
      }
    },
    [
      activeStory,
      selectedStores,
      demoTable,
      demoColumnId,
      dataMode,
      drawDemographics,
      drawStores,
    ],
  );

  const usesColumnLayers = useCallback(() => {
    if (activeStory === "Explore demographics") {
      return true;
    }
    return dataMode === "stores";
  }, [activeStory, dataMode]);

  const morphFlatness = useCallback(
    (from: number, to: number) => {
      cancelFlatMorph();
      const gen = viewGenRef.current;
      const start = performance.now();
      const step = (now: number) => {
        if (gen !== viewGenRef.current) {
          return;
        }
        const t = Math.min(1, (now - start) / FLAT_MORPH_MS);
        const flat = from + (to - from) * easeInOutCubic(t);
        flatnessRef.current = flat;
        paintFlatColumns(flat);
        if (t < 1) {
          morphRafRef.current = requestAnimationFrame(step);
          return;
        }
        morphRafRef.current = 0;
        flatnessRef.current = to;
        paintFlatColumns(to);
      };
      morphRafRef.current = requestAnimationFrame(step);
    },
    [cancelFlatMorph, paintFlatColumns],
  );

  const applyDataMode = useCallback(
    async (mode: P0DataMode) => {
      if (activeStory === "Explore demographics" && demoTable && demoColumnId) {
        const points = buildDemoPoints(
          selectedStores,
          demoTable.byStore,
          demoColumnId,
        );
        drawDemographics(points, flatnessRef.current);
        return;
      }

      if (mode === "stores") {
        drawStores(1, selectedStores, flatnessRef.current);
        return;
      }

      let data = network;
      if (!data) {
        try {
          data = await loadRealNetwork();
          setNetwork(data);
        } catch (err: unknown) {
          setLoadError(err instanceof Error ? err.message : "errore network");
          return;
        }
      }
      if (selection) {
        const nodes = data.nodes.filter((n) =>
          positionInBounds(n.position, selection.bounds),
        );
        const links = data.links.filter(
          (link) =>
            positionInBounds(link.source, selection.bounds) ||
            positionInBounds(link.target, selection.bounds),
        );
        drawNetwork(links, nodes);
        return;
      }
      drawNetwork(data.links, data.nodes);
    },
    [
      activeStory,
      selectedStores,
      selection,
      demoTable,
      demoColumnId,
      drawDemographics,
      network,
      drawStores,
      drawNetwork,
    ],
  );

  const handleDataToggle = useCallback(() => {
    // uscita dalla story demographics quando si cambia dataset
    setActiveStory(null);
    const next: P0DataMode = dataMode === "stores" ? "network" : "stores";
    setDataMode(next);
    void applyDataMode(next);
  }, [dataMode, applyDataMode]);

  const handleStorySelect = useCallback(
    async (story: P0StoryView) => {
      setActiveStory(story);
      if (story !== "Explore demographics") {
        void applyDataMode(dataMode);
        return;
      }

      setDataMode("stores");
      let table = demoTable;
      if (!table) {
        try {
          table = await loadDemographics();
          setDemoTable(table);
        } catch (err: unknown) {
          setLoadError(err instanceof Error ? err.message : "errore demographics");
          return;
        }
      }

      const cat =
        table.categories.find((c) => c.id === demoCategoryId) ?? table.categories[0];
      if (!cat) return;
      setDemoCategoryId(cat.id);
      const col =
        cat.columns.find((c) => c.id === demoColumnId) ?? cat.columns[0];
      if (col) setDemoColumnId(col.id);

      const colId = col?.id ?? cat.columns[0]?.id;
      if (!colId) return;
      const points = buildDemoPoints(selectedStores, table.byStore, colId);
      drawDemographics(points, flatnessRef.current);
    },
    [
      dataMode,
      demoTable,
      demoCategoryId,
      demoColumnId,
      selectedStores,
      drawDemographics,
      applyDataMode,
    ],
  );

  const handleDemoCategoryChange = useCallback(
    (categoryId: string) => {
      setDemoCategoryId(categoryId);
      const cat = demoTable?.categories.find((c) => c.id === categoryId);
      const first = cat?.columns[0];
      if (first) {
        setDemoColumnId(first.id);
      }
    },
    [demoTable],
  );

  /** Inquadra i bounds della selezione (o USA intera se non c'e'). */
  const frameCamera = useCallback(
    (bounds: GeoBounds | null) => {
      const m = map;
      if (!m) {
        return;
      }
      const pitch = mapView === "globe" ? ARRIVAL_PITCH : 0;

      if (!bounds) {
        // overview USA: padding basso sul globo per il vanishing point
        if (mapView === "globe") {
          m.setPadding({ top: 0, right: 0, bottom: VIEW_PAD_BOTTOM, left: 0 });
        } else {
          m.setPadding({ top: 0, right: 0, bottom: 0, left: 0 });
        }
        m.easeTo({
          center: TARGET,
          zoom: ARRIVAL_ZOOM,
          pitch,
          bearing: 0,
          duration: 1200,
        });
        return;
      }

      // selezione: padding simmetrico (il VIEW_PAD_BOTTOM spostava tutto in alto)
      m.setPadding({ top: 0, right: 0, bottom: 0, left: 0 });
      m.fitBounds(boundsToCorners(bounds), {
        padding: { top: 140, bottom: 140, left: 80, right: 80 },
        pitch,
        bearing: 0,
        duration: 1200,
        maxZoom: 12,
      });
    },
    [map, mapView],
  );

  const handleBoxSelect = useCallback(
    (bounds: GeoBounds) => {
      if (phase !== "navigabile") {
        return;
      }
      const hit = (stores ?? []).filter((store) =>
        positionInBounds(store.position, bounds),
      );
      setSelection({
        bounds,
        label: selectionLabelFromStates(hit.map((s) => s.stateName)),
      });
      frameCamera(bounds);

      const flat = flatnessRef.current;
      if (activeStory === "Explore demographics" && demoTable && demoColumnId) {
        drawDemographics(
          buildDemoPoints(hit, demoTable.byStore, demoColumnId),
          flat,
        );
        return;
      }
      if (dataMode === "stores") {
        drawStores(1, hit, flat);
        return;
      }
      if (network) {
        const nodes = network.nodes.filter((n) =>
          positionInBounds(n.position, bounds),
        );
        const links = network.links.filter(
          (link) =>
            positionInBounds(link.source, bounds) ||
            positionInBounds(link.target, bounds),
        );
        drawNetwork(links, nodes);
      }
    },
    [
      phase,
      stores,
      frameCamera,
      activeStory,
      demoTable,
      demoColumnId,
      dataMode,
      network,
      drawDemographics,
      drawStores,
      drawNetwork,
    ],
  );

  const handleMapViewToggle = useCallback(() => {
    const m = map;
    if (!m) {
      return;
    }
    const next: P0MapView = mapView === "globe" ? "map" : "globe";
    // mappa: parti dalle barre e morpha ai cerchi a fine tilt; globo: inverso
    const fromFlat = next === "map" ? 0 : 1;
    const toFlat = next === "map" ? 1 : 0;
    const gen = ++viewGenRef.current;
    cancelFlatMorph();
    flatnessRef.current = fromFlat;
    // svuota i layer prima del cambio: altrimenti restano clippati al disco
    clearLayers();
    m.setProjection({ type: next === "globe" ? "globe" : "mercator" });
    setMapView(next);
    if (next === "map") {
      m.setPadding({ top: 0, right: 0, bottom: 0, left: 0 });
      m.easeTo({ pitch: 0, duration: VIEW_TILT_MS });
    } else {
      m.setPadding({ top: 0, right: 0, bottom: VIEW_PAD_BOTTOM, left: 0 });
      m.easeTo({ pitch: ARRIVAL_PITCH, duration: VIEW_TILT_MS });
    }

    if (!usesColumnLayers()) {
      flatnessRef.current = toFlat;
      return;
    }

    window.setTimeout(() => {
      if (gen !== viewGenRef.current) {
        return;
      }
      morphFlatness(fromFlat, toFlat);
    }, VIEW_TILT_MS);
  }, [map, mapView, clearLayers, cancelFlatMorph, usesColumnLayers, morphFlatness]);

  /** Frame: inquadra la selezione corrente, altrimenti overview USA. */
  const handleCenterUsa = useCallback(() => {
    frameCamera(selection?.bounds ?? null);
  }, [frameCamera, selection]);

  /** Click su Selection nell'header: torna a United States. */
  const handleClearSelection = useCallback(() => {
    if (!selection) {
      return;
    }
    setSelection(null);
    frameCamera(null);
  }, [selection, frameCamera]);

  const headerStats = useMemo(
    () =>
      contextStats.map((stat) =>
        stat.label === "Selection" && selection
          ? { ...stat, onClick: handleClearSelection }
          : stat,
      ),
    [contextStats, selection, handleClearSelection],
  );

  // dopo il cambio proiezione / metrica demo / selezione, ridefinisce i layer
  useEffect(() => {
    if (phase !== "navigabile") {
      return;
    }
    const timer = window.setTimeout(() => {
      void applyDataMode(dataMode);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [
    mapView,
    phase,
    dataMode,
    applyDataMode,
    demoColumnId,
    demoCategoryId,
    activeStory,
    selection,
  ]);

  useEffect(() => {
    if (phase === "orbita") {
      setActiveStory(null);
      setViewsOpen(false);
    }
  }, [phase]);

  const animate = useCallback((ms: number, onFrame: (eased: number) => void) => {
    return new Promise<void>((resolve) => {
      const start = performance.now();
      const step = (now: number) => {
        const linear = Math.min(1, (now - start) / ms);
        onFrame(linear * linear * (3 - 2 * linear));
        if (linear >= 1) {
          return resolve();
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }, []);

  /** Entra in orbita appena la mappa e' pronta: niente zoom automatico. */
  useEffect(() => {
    if (!map) {
      return;
    }
    setPhase("orbita");
    startSpin(map);
  }, [map, startSpin]);

  const run = useCallback(async () => {
    const m = map;
    const data = stores;
    if (!m || !data || busy) {
      return;
    }

    const id = ++runId.current;
    const alive = () => id === runId.current;

    setBusy(true);
    setDataMode("stores");
    setMapView("globe");
    setViewsOpen(false);
    setSelection(null);
    viewGenRef.current += 1;
    cancelFlatMorph();
    flatnessRef.current = 0;
    // ferma il loop di spin ma riparte dalla posizione corrente: niente salto, niente sipario
    stopSpin();
    clearLayers();

    const from = m.getCenter();
    const fromZoom = m.getZoom();
    const fromPitch = m.getPitch();

    drawStores(0, data);
    setPhase("discesa");

    // un unico gesto: dalla longitudine in rotazione fino agli USA, zoom + pitch
    await animate(3500, (t) => {
      m.jumpTo({
        center: [lerpLng(from.lng, TARGET[0], t), from.lat + (TARGET[1] - from.lat) * t],
        zoom: fromZoom + (ARRIVAL_ZOOM - fromZoom) * t,
        pitch: fromPitch + (ARRIVAL_PITCH - fromPitch) * t,
        bearing: 0,
        padding: { top: 0, right: 0, bottom: VIEW_PAD_BOTTOM * t, left: 0 },
      });
    });
    if (!alive()) {
      setBusy(false);
      return;
    }
    // blocca il padding all'arrivo (altrimenti un pan successivo lo perde)
    m.setPadding({ top: 0, right: 0, bottom: VIEW_PAD_BOTTOM, left: 0 });

    setPhase("colonne");
    await animate(2600, (t) => drawStores(t, data));
    if (!alive()) {
      setBusy(false);
      return;
    }

    setPhase("navigabile");
    setBusy(false);
  }, [map, stores, busy, drawStores, animate, stopSpin, clearLayers, cancelFlatMorph]);

  const returnToOrbit = useCallback(() => {
    const m = map;
    if (!m) {
      return;
    }
    runId.current += 1;
    viewGenRef.current += 1;
    cancelFlatMorph();
    flatnessRef.current = 0;
    setBusy(false);
    setDataMode("stores");
    setMapView("globe");
    setViewsOpen(false);
    setSelection(null);
    stopSpin();
    clearLayers();
    m.setPadding({ top: 0, right: 0, bottom: 0, left: 0 });
    m.jumpTo({
      center: [m.getCenter().lng, ORBIT_LAT],
      zoom: START_ZOOM,
      pitch: 0,
      bearing: 0,
    });
    setPhase("orbita");
    startSpin(m);
  }, [map, stopSpin, clearLayers, startSpin, cancelFlatMorph]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        if (phase !== "orbita" || !stores) {
          return;
        }
        void run();
        return;
      }
      if (e.key === "r" || e.key === "R") {
        returnToOrbit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, stores, run, returnToOrbit]);

  return (
    <main className="h-screen w-screen overflow-hidden bg-black">
      <Stage width={WIDTH} height={HEIGHT}>
        <div
          className="relative"
          style={{ width: WIDTH, height: HEIGHT, background: "#171A2D" }}
        >
          <MapSurface
            width={WIDTH}
            height={HEIGHT}
            styleUrl={STYLE}
            projection={mapView === "globe" ? "globe" : "mercator"}
            onBoxSelect={handleBoxSelect}
            onReady={handleReady}
          />
          <AloneGlobo leggi={bordoGlobo} larghezza={WIDTH} altezza={HEIGHT} />
          <P0ContextPanel
            title={viewTitle}
            stats={headerStats}
            visible={phase === "navigabile"}
          />
          {/*
            Titolo fisso al centro sul globo in orbita (stesso brand di T13).
            Resta montato cosi' il fade-out CSS funziona allo zoom.
          */}
          <div
            className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center"
            style={{
              opacity: phase === "orbita" ? 1 : 0,
              transition: "opacity 1200ms ease-out",
            }}
          >
            <div
              style={{
                fontSize: 64,
                letterSpacing: "0.2em",
                color: "#6B7EF1",
                textTransform: "uppercase",
              }}
            >
              Procter &amp; Gamble
            </div>
            <div
              style={{
                fontSize: 156,
                fontWeight: 600,
                letterSpacing: "-0.04em",
                color: "#6B7EF1",
                marginTop: 8,
              }}
            >
              Mapping Tool
            </div>
          </div>
          <div
            className="absolute top-1/2 z-30"
            style={{
              left: viewsOpen ? 64 : WIDTH / 5,
              transform: viewsOpen
                ? "translate(0, -50%)"
                : "translate(-50%, -50%)",
              opacity: phase === "navigabile" ? 1 : 0,
              pointerEvents: phase === "navigabile" ? "auto" : "none",
              transition:
                "left 500ms cubic-bezier(0.4, 0, 0.2, 1), transform 500ms cubic-bezier(0.4, 0, 0.2, 1), opacity 900ms cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          >
            <P0NavMenu
              dataMode={dataMode}
              onDataToggle={handleDataToggle}
              mapView={mapView}
              onMapViewToggle={handleMapViewToggle}
              onCenterUsa={handleCenterUsa}
              viewsOpen={viewsOpen}
              onViewsOpenChange={setViewsOpen}
            />
          </div>
          <div
            className="absolute top-1/2 z-30 -translate-y-1/2"
            style={{
              // più a destra del nav aperto, gap ampio tra i due elementi
              left: 560,
              opacity: phase === "navigabile" && viewsOpen ? 1 : 0,
              pointerEvents:
                phase === "navigabile" && viewsOpen ? "auto" : "none",
              transition: "opacity 450ms cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          >
            <P0ViewsPanel
              visible={viewsOpen && phase === "navigabile"}
              activeStory={activeStory}
              onStorySelect={(story) => void handleStorySelect(story)}
              categories={demoTable?.categories}
              categoryId={demoCategoryId}
              columnId={demoColumnId}
              onCategoryChange={handleDemoCategoryChange}
              onColumnChange={setDemoColumnId}
              metricSummary={demoRecap}
              metricLabel={demoColumn?.label}
            />
          </div>
        </div>
      </Stage>

      <Hud>
        <div className="flex items-start gap-3">
          <HudPanel title="P0 — overview USA">
            <Row label="momento" value={PHASE_LABEL[phase]} tone="good" />
            <Row
              label="fotogrammi mediana"
              value={`${stats.median.toFixed(1)}/s`}
              tone={stats.median ? fpsTone(stats.median) : "normal"}
            />
            <Row
              label="minimo (finestra)"
              value={`${stats.min.toFixed(1)}/s`}
              tone={stats.min ? fpsTone(stats.min) : "normal"}
            />
            <Row
              label="peggiore (sessione)"
              value={`${stats.worst.toFixed(1)}/s`}
              tone={stats.worst ? fpsTone(stats.worst) : "normal"}
            />
            <Row
              label="misura attendibile"
              value={trust.suspect ? "NO" : "si"}
              tone={trust.suspect ? "bad" : "good"}
            />
          </HudPanel>

          <HudPanel title="dati">
            {dataMode === "stores" ? (
              <>
                <Row label="vista" value="store" />
                <Row label="negozi" value={stores ? stores.length : "…"} />
                <Row label="colore" value="comp_cvs" />
                <Row label="altezza" value="comp_walgreens" />
              </>
            ) : (
              <>
                <Row label="vista" value="network" />
                <Row label="archi" value={network ? network.links.length : "…"} />
                <Row label="nodi" value={network ? network.nodes.length : "…"} />
                <Row label="peso" value="Dollars" />
              </>
            )}
          </HudPanel>
        </div>

        <div className="flex flex-col gap-2">
          {loadError ? (
            <HudPanel>
              <div className="text-red-400">{loadError}</div>
            </HudPanel>
          ) : null}
          {trust.reason ? (
            <HudPanel>
              <div className="text-red-400">Misura non valida — {trust.reason}</div>
            </HudPanel>
          ) : null}
          <HudPanel>
            <div className="text-white/60">
              {phase === "orbita" ? (
                stores ? (
                  <>
                    <b className="text-white">Spazio</b> avvia la sequenza
                  </>
                ) : (
                  <>caricamento dati…</>
                )
              ) : phase === "navigabile" ? (
                <>
                  <b className="text-white">R</b> torna all&apos;orbita · mappa navigabile
                </>
              ) : (
                <>sequenza in corso…</>
              )}
            </div>
          </HudPanel>
        </div>
      </Hud>
    </main>
  );
}
