"use client";

import {
  AmbientLight,
  ColumnLayer,
  DirectionalLight,
  HexagonLayer,
  LightingEffect,
  MapLibreOverlay,
} from "deck.gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Hud, HudPanel, Row, fpsTone } from "@/components/lab/Hud";
import { MapSurface, type MapHandle } from "@/components/lab/MapSurface";
import { Stage } from "@/components/lab/Stage";
import { makeHexGrid, type HexCell } from "@/lib/lab/hexGrid";
import { under } from "@/lib/lab/map";
import { makeStorePoints, type StorePoint } from "@/lib/lab/points";
import { useFrameMeter } from "@/lib/lab/useFrameMeter";
import { useRenderTrust } from "@/lib/lab/useRenderTrust";

const WIDTH = 5760;
const HEIGHT = 1080;
const TARGET: [number, number] = [-94.5786, 39.0997];
const STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

type Mode = "celle pronte" | "aggregazione a runtime";
const CELL_COUNTS = [500, 2000, 10000];
const POINT_COUNTS = [10000, 27000, 100000];

/** Luce obliqua fissa: le ombre sono cio' che rende leggibile l'altezza da lontano. */
function makeLighting(shadows: boolean) {
  return new LightingEffect({
    ambient: new AmbientLight({ color: [255, 255, 255], intensity: 1.0 }),
    sun: new DirectionalLight({
      color: [255, 255, 255],
      intensity: 2.0,
      direction: [-1.2, -3, -1],
      _shadow: shadows,
    }),
  });
}

export default function T4Page() {
  const [map, setMap] = useState<MapHandle | null>(null);
  const [mode, setMode] = useState<Mode>("celle pronte");
  const [cellCount, setCellCount] = useState(2000);
  const [pointCount, setPointCount] = useState(10000);
  const [shadows, setShadows] = useState(true);
  const [gpuAggregation, setGpuAggregation] = useState(true);
  const [year, setYear] = useState<"oggi" | "un anno fa">("oggi");
  const [spinning, setSpinning] = useState(false);
  const [aggregationMs, setAggregationMs] = useState<number | null>(null);
  const [labelId, setLabelId] = useState<string | undefined>();

  const overlayRef = useRef<MapLibreOverlay | null>(null);
  const aggregationStart = useRef(0);
  const { stats } = useFrameMeter();
  const trust = useRenderTrust(stats.medianMs);

  const cells = useMemo(
    () => makeHexGrid({ center: TARGET, count: cellCount, cellRadiusMeters: 900 }),
    [cellCount],
  );
  const points = useMemo(
    () => makeStorePoints({ center: TARGET, count: pointCount }),
    [pointCount],
  );

  const handleReady = useCallback((m: MapHandle) => {
    m.jumpTo({ center: TARGET, zoom: 10.2, pitch: 55, bearing: 0 });
    setLabelId(m.getStyle().layers.find((l) => l.type === "symbol")?.id);
    setMap(m);
  }, []);

  useEffect(() => {
    if (!map) return;
    const overlay = new MapLibreOverlay({ interleaved: true, layers: [] });
    map.addControl(overlay);
    overlayRef.current = overlay;
    return () => {
      overlayRef.current = null;
      map.removeControl(overlay);
    };
  }, [map]);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    const layer =
      mode === "celle pronte"
        ? new ColumnLayer<HexCell>({
            id: "celle",
            data: cells,
            diskResolution: 6,
            radius: 780,
            extruded: true,
            pickable: false,
            getPosition: (d) => d.position,
            // Il "respiro": la stessa cella con due altezze diverse.
            getElevation: (d) =>
              (year === "oggi" ? d.value : 1 - d.value * 0.8) * 9000,
            getFillColor: (d) => [40 + d.value * 130, 95 + d.value * 105, 155, 225],
            // La transizione avviene sugli attributi gia' caricati: deck.gl
            // interpola sulla scheda video, senza ricostruire la geometria.
            transitions: { getElevation: { duration: 1500 } },
            updateTriggers: { getElevation: year },
            ...under(labelId),
          })
        : new HexagonLayer<StorePoint>({
            id: "aggregate",
            data: points,
            radius: 3000,
            extruded: true,
            pickable: false,
            gpuAggregation,
            getPosition: (d) => d.position,
            getElevationWeight: (d) => (year === "oggi" ? d.value : d.valueBefore),
            elevationScale: 120,
            updateTriggers: { getElevationWeight: year },
            onSetElevationDomain: () => {
              if (aggregationStart.current) {
                setAggregationMs(performance.now() - aggregationStart.current);
                aggregationStart.current = 0;
              }
            },
            ...under(labelId),
          });

    if (mode === "aggregazione a runtime") aggregationStart.current = performance.now();
    overlay.setProps({ layers: [layer], effects: [makeLighting(shadows)] });
  }, [cells, points, mode, year, shadows, gpuAggregation, labelId]);

  useEffect(() => {
    if (!map || !spinning) return;
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      map.setBearing((((now - start) / 1000) * 20) % 360);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [map, spinning]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "m" || e.key === "M")
        setMode((v) => {
          const next = v === "celle pronte" ? "aggregazione a runtime" : "celle pronte";
          // Le due modalita' coprono estensioni molto diverse: le celle pronte
          // stanno in un'area urbana, i punti grezzi su piu' stati.
          map?.easeTo({ zoom: next === "celle pronte" ? 10.2 : 7.4, duration: 600 });
          return next;
        });
      if (e.key === "n" || e.key === "N") {
        setCellCount((c) => CELL_COUNTS[(CELL_COUNTS.indexOf(c) + 1) % CELL_COUNTS.length]);
        setPointCount((c) => POINT_COUNTS[(POINT_COUNTS.indexOf(c) + 1) % POINT_COUNTS.length]);
      }
      if (e.key === "o" || e.key === "O") setShadows((v) => !v);
      if (e.key === "g" || e.key === "G") setGpuAggregation((v) => !v);
      if (e.key === "t" || e.key === "T")
        setYear((y) => (y === "oggi" ? "un anno fa" : "oggi"));
      if (e.code === "Space") {
        e.preventDefault();
        setSpinning((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [map]);

  return (
    <main className="h-screen w-screen overflow-hidden bg-black">
      <Stage width={WIDTH} height={HEIGHT}>
        <MapSurface
          width={WIDTH}
          height={HEIGHT}
          styleUrl={STYLE}
          projection="mercator"
          onReady={handleReady}
        />
      </Stage>

      <Hud>
        <div className="flex items-start gap-3">
          <HudPanel title="T4 — il rilievo">
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

          <HudPanel title="scena">
            <Row label="modalita'" value={mode} tone="good" />
            <Row
              label={mode === "celle pronte" ? "celle" : "punti grezzi"}
              value={(mode === "celle pronte" ? cellCount : pointCount).toLocaleString("it-IT")}
            />
            <Row label="ombre" value={shadows ? "attive" : "spente"} tone={shadows ? "good" : "warn"} />
            {mode === "aggregazione a runtime" ? (
              <>
                <Row
                  label="aggregazione"
                  value={gpuAggregation ? "su scheda video" : "su processore"}
                />
                <Row
                  label="tempo di aggregazione"
                  value={aggregationMs === null ? "..." : `${aggregationMs.toFixed(0)} ms`}
                  tone={
                    aggregationMs === null
                      ? "normal"
                      : aggregationMs > 2000
                        ? "bad"
                        : aggregationMs > 500
                          ? "warn"
                          : "good"
                  }
                />
              </>
            ) : null}
            <Row label="momento" value={year} />
            <Row label="rotazione" value={spinning ? "attiva" : "ferma"} />
          </HudPanel>
        </div>

        <div className="flex flex-col gap-2">
          {trust.reason ? (
            <HudPanel>
              <div className="text-red-400">Misura non valida — {trust.reason}</div>
            </HudPanel>
          ) : null}
          <HudPanel>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-white/60">
              <span>
                <b className="text-white">M</b> modalita&apos;
              </span>
              <span>
                <b className="text-white">N</b> quantita&apos;
              </span>
              <span>
                <b className="text-white">T</b> respiro oggi / un anno fa
              </span>
              <span>
                <b className="text-white">O</b> ombre
              </span>
              <span>
                <b className="text-white">G</b> aggregazione scheda video / processore
              </span>
              <span>
                <b className="text-white">spazio</b> rotazione
              </span>
            </div>
          </HudPanel>
        </div>
      </Hud>
    </main>
  );
}
