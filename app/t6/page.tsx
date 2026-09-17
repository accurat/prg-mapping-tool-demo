"use client";

import { MapLibreOverlay, ScatterplotLayer } from "deck.gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Hud, HudPanel, Row, fpsTone } from "@/components/lab/Hud";
import { MapSurface, type MapHandle } from "@/components/lab/MapSurface";
import { Stage } from "@/components/lab/Stage";
import { under } from "@/lib/lab/map";
import { makeStorePoints, type StorePoint } from "@/lib/lab/points";
import { useFrameMeter } from "@/lib/lab/useFrameMeter";
import { useRenderTrust } from "@/lib/lab/useRenderTrust";
import { legibility } from "@/lib/lab/wall";

const WIDTH = 5760;
const HEIGHT = 1080;
const TARGET: [number, number] = [-94.5786, 39.0997];
const STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

const COUNTS = [10000, 27000, 100000];

export default function T6Page() {
  const [map, setMap] = useState<MapHandle | null>(null);
  const [count, setCount] = useState(27000);
  const [pickable, setPickable] = useState(true);
  const [continuousPicking, setContinuousPicking] = useState(false);
  const [radiusPx, setRadiusPx] = useState(5);
  const [picked, setPicked] = useState<string>("—");
  const [pickMs, setPickMs] = useState<number | null>(null);
  const [labelId, setLabelId] = useState<string | undefined>();

  const overlayRef = useRef<MapLibreOverlay | null>(null);
  const { stats } = useFrameMeter();
  const trust = useRenderTrust(stats.medianMs);

  const points = useMemo(
    () => makeStorePoints({ center: TARGET, count, spreadDeg: 4 }),
    [count],
  );
  const dotLegibility = legibility(radiusPx * 2);

  const handleReady = useCallback((m: MapHandle) => {
    m.jumpTo({ center: TARGET, zoom: 6.6, pitch: 45, bearing: 0 });
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
    overlay.setProps({
      layers: [
        new ScatterplotLayer<StorePoint>({
          id: "negozi",
          data: points,
          pickable,
          radiusUnits: "pixels",
          getRadius: radiusPx,
          getPosition: (d) => d.position,
          getFillColor: (d) => [
            60 + d.value * 195,
            140 + d.value * 80,
            230 - d.value * 140,
            220,
          ],
          ...under(labelId),
        }),
      ],
    });
  }, [points, pickable, radiusPx, labelId]);

  /**
   * Rilevamento del tocco a ogni fotogramma.
   *
   * E' il caso peggiore reale: durante un trascinamento di selezione la scena
   * va interrogata mentre si sta anche ridisegnando. Il rilevamento comporta un
   * passaggio di rendering aggiuntivo, quindi e' un costo vero e va isolato.
   */
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay || !continuousPicking) return;

    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = (now - start) / 1000;
      const x = WIDTH / 2 + Math.cos(t * 0.8) * (WIDTH * 0.3);
      const y = HEIGHT / 2 + Math.sin(t * 1.1) * (HEIGHT * 0.25);

      const t0 = performance.now();
      const info = overlay.pickObject({ x, y, radius: 4 });
      setPickMs(performance.now() - t0);
      setPicked(info?.object ? `negozio a ${info.index}` : "nessuno");

      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [continuousPicking]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "n" || e.key === "N")
        setCount((c) => COUNTS[(COUNTS.indexOf(c) + 1) % COUNTS.length]);
      if (e.key === "p" || e.key === "P") setPickable((v) => !v);
      if (e.code === "Space") {
        e.preventDefault();
        setContinuousPicking((v) => !v);
      }
      if (e.key === "r" || e.key === "R") setRadiusPx((r) => (r >= 14 ? 2 : r + 3));
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
          <HudPanel title="T6 — punti e selezione">
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
              label="misura attendibile"
              value={trust.suspect ? "NO" : "si"}
              tone={trust.suspect ? "bad" : "good"}
            />
          </HudPanel>

          <HudPanel title="scena">
            <Row label="punti" value={count.toLocaleString("it-IT")} tone="good" />
            <Row label="toccabili" value={pickable ? "si" : "no"} />
            <Row
              label="rilevamento continuo"
              value={continuousPicking ? "attivo" : "spento"}
              tone={continuousPicking ? "warn" : "normal"}
            />
            {continuousPicking ? (
              <>
                <Row
                  label="costo del rilevamento"
                  value={pickMs === null ? "..." : `${pickMs.toFixed(1)} ms`}
                  tone={pickMs !== null && pickMs > 8 ? "bad" : pickMs !== null && pickMs > 3 ? "warn" : "good"}
                />
                <Row label="sotto il puntatore" value={picked} />
              </>
            ) : null}
            <Row
              label="raggio punto"
              value={`${radiusPx} px · ${dotLegibility.arcmin.toFixed(1)}' a 12 m — ${dotLegibility.verdict}`}
              tone={
                dotLegibility.verdict === "invisibile"
                  ? "bad"
                  : dotLegibility.verdict === "al limite"
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
                <b className="text-white">N</b> numero di punti
              </span>
              <span>
                <b className="text-white">P</b> toccabili
              </span>
              <span>
                <b className="text-white">spazio</b> rilevamento continuo
              </span>
              <span>
                <b className="text-white">R</b> raggio
              </span>
            </div>
          </HudPanel>
        </div>
      </Hud>
    </main>
  );
}
