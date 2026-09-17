"use client";

import { ArcLayer, MapLibreOverlay, TripsLayer } from "deck.gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Hud, HudPanel, Row, fpsTone } from "@/components/lab/Hud";
import { MapSurface, type MapHandle } from "@/components/lab/MapSurface";
import { Stage } from "@/components/lab/Stage";
import { under } from "@/lib/lab/map";
import { makeRoutes, toTripPaths, type Route, type TripPath } from "@/lib/lab/routes";
import { useFrameMeter } from "@/lib/lab/useFrameMeter";
import { useRenderTrust } from "@/lib/lab/useRenderTrust";
import { legibility } from "@/lib/lab/wall";

const WIDTH = 5760;
const HEIGHT = 1080;
const TARGET: [number, number] = [-94.5786, 39.0997];
const STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

const COUNTS = [500, 5000, 50000];
const CYCLE = 1000;

export default function T5Page() {
  const [map, setMap] = useState<MapHandle | null>(null);
  const [count, setCount] = useState(500);
  const [animated, setAnimated] = useState(false);
  const [widthPx, setWidthPx] = useState(6);
  const [closeUp, setCloseUp] = useState(false);
  const [labelId, setLabelId] = useState<string | undefined>();

  const overlayRef = useRef<MapLibreOverlay | null>(null);
  const timeRef = useRef(0);
  const { stats } = useFrameMeter();
  const trust = useRenderTrust(stats.medianMs);

  const routes = useMemo(() => makeRoutes({ center: TARGET, count }), [count]);
  const trips = useMemo(() => (animated ? toTripPaths(routes, 24, CYCLE) : []), [routes, animated]);

  const lineLegibility = legibility(widthPx);

  const handleReady = useCallback((m: MapHandle) => {
    m.jumpTo({ center: TARGET, zoom: 5.4, pitch: 50, bearing: 0 });
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
    map?.easeTo({ zoom: closeUp ? 8.4 : 5.4, pitch: closeUp ? 58 : 50, duration: 600 });
  }, [map, closeUp]);

  // Archi statici: una sola riscrittura dei layer quando cambiano i parametri.
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay || animated) return;
    overlay.setProps({
      layers: [
        new ArcLayer<Route>({
          id: "archi",
          data: routes,
          getSourcePosition: (d) => d.source,
          getTargetPosition: (d) => d.target,
          getSourceColor: () => [70, 120, 200, 180],
          getTargetColor: (d) => [255, 190 - d.weight * 90, 90, 220],
          getWidth: widthPx,
          widthUnits: "pixels",
          getHeight: (d) => 0.4 + d.weight * 0.6,
          ...under(labelId),
        }),
      ],
    });
  }, [routes, animated, widthPx, labelId]);

  // Flusso animato: il tempo avanza a ogni fotogramma e la scia scorre.
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay || !animated) return;

    let raf = 0;
    const step = () => {
      timeRef.current = (timeRef.current + 4) % CYCLE;
      overlay.setProps({
        layers: [
          new TripsLayer<TripPath>({
            id: "flusso",
            data: trips,
            getPath: (d) => d.path,
            getTimestamps: (d) => d.timestamps,
            getColor: (d) => [255, 190 - d.weight * 90, 90],
            widthUnits: "pixels",
            getWidth: widthPx,
            trailLength: CYCLE * 0.25,
            currentTime: timeRef.current,
            ...under(labelId),
          }),
        ],
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [trips, animated, widthPx, labelId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "n" || e.key === "N")
        setCount((c) => COUNTS[(COUNTS.indexOf(c) + 1) % COUNTS.length]);
      if (e.key === "a" || e.key === "A") setAnimated((v) => !v);
      if (e.key === "w" || e.key === "W") setWidthPx((w) => (w >= 12 ? 2 : w + 2));
      if (e.key === "c" || e.key === "C") setCloseUp((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
          <HudPanel title="T5 — archi negozio / hub">
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
            <Row label="rotte" value={count.toLocaleString("it-IT")} tone="good" />
            <Row
              label="resa"
              value={animated ? "flusso animato (percorsi)" : "archi statici"}
              tone={animated ? "warn" : "normal"}
            />
            {animated ? (
              <Row
                label="punti disegnati"
                value={(count * 24).toLocaleString("it-IT")}
              />
            ) : null}
            <Row label="inquadratura" value={closeUp ? "ravvicinata" : "regionale"} />
            <Row
              label="spessore linea"
              value={`${widthPx} px · ${lineLegibility.arcmin.toFixed(1)}' a 12 m — ${lineLegibility.verdict}`}
              tone={
                lineLegibility.verdict === "invisibile"
                  ? "bad"
                  : lineLegibility.verdict === "al limite"
                    ? "warn"
                    : "good"
              }
            />
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
                <b className="text-white">N</b> numero di rotte
              </span>
              <span>
                <b className="text-white">A</b> archi statici / flusso animato
              </span>
              <span>
                <b className="text-white">W</b> spessore
              </span>
              <span>
                <b className="text-white">C</b> inquadratura ravvicinata
              </span>
            </div>
          </HudPanel>
        </div>
      </Hud>
    </main>
  );
}
