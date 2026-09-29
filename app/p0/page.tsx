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
import { MapSurface, type MapHandle } from "@/components/lab/MapSurface";
import { Stage } from "@/components/lab/Stage";
import { AloneGlobo } from "@/components/tour/AloneGlobo";
import { leggiBordoDaOverlay } from "@/lib/lab/bordoGlobo";
import { under } from "@/lib/lab/map";
import { loadRealNetwork, type NetworkLink, type NetworkNode } from "@/lib/lab/realNetwork";
import { loadRealStores, type RealStore } from "@/lib/lab/realStores";
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
/** Raggio colonna in metri. */
const COLUMN_RADIUS_M = 12000;

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const overlayRef = useRef<MapLibreOverlay | null>(null);
  const runId = useRef(0);
  const spinning = useRef(false);
  const spinRaf = useRef(0);
  /** Intensita' base dell'alone: acceso subito, senza fade-in. */
  const aloneRef = useRef(1);

  const { stats } = useFrameMeter();
  const trust = useRenderTrust(stats.medianMs);

  /** Aggregati della selezione corrente (oggi: overview USA intera). */
  const contextStats = useMemo((): ContextStat[] => {
    if (dataMode === "network") {
      const links = network?.links ?? [];
      const nodes = network?.nodes ?? [];
      const dollars = links.reduce((sum, link) => sum + link.dollars, 0);
      return [
        { label: "Selection", value: "United States" },
        { label: "Links", value: conta(links.length) },
        { label: "Nodes", value: conta(nodes.length) },
        { label: "Total dollars", value: valuta(dollars) },
      ];
    }

    const list = stores ?? [];
    const sales = list.reduce((sum, store) => sum + store.salesUsd, 0);
    const states = new Set(list.map((store) => store.stateName).filter(Boolean));
    return [
      { label: "Selection", value: "United States" },
      { label: "Stores", value: conta(list.length) },
      { label: "Total sales", value: valuta(sales) },
      { label: "States", value: conta(states.size) },
    ];
  }, [dataMode, stores, network]);

  const viewTitle =
    dataMode === "network" ? "Supply network" : "Store competitive density";

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
    const overlay = new MapLibreOverlay({
      interleaved: true,
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
    (rise: number, data: RealStore[]) => {
      const overlay = overlayRef.current;
      if (!overlay) {
        return;
      }

      const ease = rise * rise * (3 - 2 * rise);
      // id diverso per vista: deck.gl altrimenti tiene il clip circolare del globo
      const viewKey = mapView === "globe" ? "globe" : "map";

      overlay.setProps({
        layers: [
          new ColumnLayer<RealStore>({
            id: `negozi-${viewKey}`,
            data,
            diskResolution: 6,
            radius: COLUMN_RADIUS_M,
            extruded: true,
            // senza materiale il colore del dato non viene oscurato dal lighting
            material: false,
            getPosition: (d) => d.position,
            getElevation: (d) => d.heightValue * DATA_HEIGHT_M * ease,
            getFillColor: (d) => {
              const c = valueColor(d.colorValue);
              return [c[0], c[1], c[2], c[3] * ease];
            },
            updateTriggers: {
              getElevation: rise,
              getFillColor: rise,
            },
            ...under(labelId),
          }),
        ],
        effects: [LIGHT],
      });
    },
    [labelId, mapView],
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

  const applyDataMode = useCallback(
    async (mode: P0DataMode) => {
      if (mode === "stores") {
        if (stores) {
          drawStores(1, stores);
        }
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
      drawNetwork(data.links, data.nodes);
    },
    [stores, network, drawStores, drawNetwork],
  );

  const handleDataToggle = useCallback(() => {
    const next: P0DataMode = dataMode === "stores" ? "network" : "stores";
    setDataMode(next);
    void applyDataMode(next);
  }, [dataMode, applyDataMode]);

  /** Globo inclinato ↔ mappa classica dall'alto (stesso centro/zoom). */
  const handleMapViewToggle = useCallback(() => {
    const m = map;
    if (!m) {
      return;
    }
    const next: P0MapView = mapView === "globe" ? "map" : "globe";
    // svuota i layer prima del cambio: altrimenti restano clippati al disco
    clearLayers();
    m.setProjection({ type: next === "globe" ? "globe" : "mercator" });
    setMapView(next);
    if (next === "map") {
      m.setPadding({ top: 0, right: 0, bottom: 0, left: 0 });
      m.easeTo({ pitch: 0, duration: 600 });
    } else {
      m.setPadding({ top: 0, right: 0, bottom: VIEW_PAD_BOTTOM, left: 0 });
      m.easeTo({ pitch: ARRIVAL_PITCH, duration: 600 });
    }
  }, [map, mapView, clearLayers]);

  /** Riporta centro/zoom/pitch all'inquadratura USA di arrivo. */
  const handleCenterUsa = useCallback(() => {
    const m = map;
    if (!m) {
      return;
    }
    if (mapView === "globe") {
      m.setPadding({ top: 0, right: 0, bottom: VIEW_PAD_BOTTOM, left: 0 });
      m.easeTo({
        center: TARGET,
        zoom: ARRIVAL_ZOOM,
        pitch: ARRIVAL_PITCH,
        bearing: 0,
        duration: 1200,
      });
    } else {
      m.setPadding({ top: 0, right: 0, bottom: 0, left: 0 });
      m.easeTo({
        center: TARGET,
        zoom: ARRIVAL_ZOOM,
        pitch: 0,
        bearing: 0,
        duration: 1200,
      });
    }
  }, [map, mapView]);

  // dopo il cambio proiezione, ridefinisce i layer con id nuovo (sync deck ↔ maplibre)
  useEffect(() => {
    if (phase !== "navigabile") {
      return;
    }
    const timer = window.setTimeout(() => {
      void applyDataMode(dataMode);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [mapView, phase, dataMode, applyDataMode]);

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
  }, [map, stores, busy, drawStores, animate, stopSpin, clearLayers]);

  const returnToOrbit = useCallback(() => {
    const m = map;
    if (!m) {
      return;
    }
    runId.current += 1;
    setBusy(false);
    setDataMode("stores");
    setMapView("globe");
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
  }, [map, stopSpin, clearLayers, startSpin]);

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
            onReady={handleReady}
          />
          <AloneGlobo leggi={bordoGlobo} larghezza={WIDTH} altezza={HEIGHT} />
          <P0ContextPanel
            title={viewTitle}
            stats={contextStats}
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
            className="absolute top-1/2 z-30 -translate-x-1/2 -translate-y-1/2"
            style={{
              left: WIDTH / 5,
              opacity: phase === "navigabile" ? 1 : 0,
              pointerEvents: phase === "navigabile" ? "auto" : "none",
              transition: "opacity 900ms cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          >
            <P0NavMenu
              dataMode={dataMode}
              onDataToggle={handleDataToggle}
              mapView={mapView}
              onMapViewToggle={handleMapViewToggle}
              onCenterUsa={handleCenterUsa}
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
