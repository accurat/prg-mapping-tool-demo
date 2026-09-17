"use client";

import { ColumnLayer, MapLibreOverlay } from "deck.gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Hud, HudPanel, Row, fpsTone } from "@/components/lab/Hud";
import { MapSurface, type MapHandle } from "@/components/lab/MapSurface";
import { Stage } from "@/components/lab/Stage";
import { cellAt, makeHexGrid, type HexCell } from "@/lib/lab/hexGrid";
import { under } from "@/lib/lab/map";
import { measure, wait } from "@/lib/lab/measure";
import { useFrameMeter } from "@/lib/lab/useFrameMeter";
import { useRenderTrust } from "@/lib/lab/useRenderTrust";

const WIDTH = 5760;
const HEIGHT = 1080;
const TARGET: [number, number] = [-94.5786, 39.0997];
const STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const CELL_RADIUS_M = 6000;
const SPEC = { center: TARGET, cellRadiusMeters: CELL_RADIUS_M };

type BrushMode = "geometrico" | "grafico";

export default function T7Page() {
  const [map, setMap] = useState<MapHandle | null>(null);
  const [brushMode, setBrushMode] = useState<BrushMode>("geometrico");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [resolveMs, setResolveMs] = useState<number | null>(null);
  const [labelId, setLabelId] = useState<string | undefined>();
  const [dragging, setDragging] = useState(false);
  const [autoStep, setAutoStep] = useState<string | null>(null);

  const overlayRef = useRef<MapLibreOverlay | null>(null);
  const selectedRef = useRef(selected);
  const pendingTouch = useRef<number | null>(null);

  // Il pennello legge la selezione corrente da un riferimento invece che dalla
  // chiusura, cosi' non va ricostruito a ogni cella dipinta.
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const { stats } = useFrameMeter();
  const trust = useRenderTrust(stats.medianMs);

  const cells = useMemo(
    () => makeHexGrid({ center: TARGET, count: 3000, cellRadiusMeters: CELL_RADIUS_M }),
    [],
  );

  const handleReady = useCallback((m: MapHandle) => {
    m.jumpTo({ center: TARGET, zoom: 7.6, pitch: 50, bearing: 0 });
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
        new ColumnLayer<HexCell>({
          id: "celle",
          data: cells,
          diskResolution: 6,
          radius: CELL_RADIUS_M * 0.92,
          extruded: true,
          pickable: brushMode === "grafico",
          getPosition: (d) => d.position,
          getElevation: (d) => d.value * 26000,
          getFillColor: (d) =>
            selected.has(d.key)
              ? [255, 210, 80, 255]
              : [40 + d.value * 90, 80 + d.value * 90, 150, 200],
          updateTriggers: { getFillColor: selected },
          ...under(labelId),
        }),
      ],
    });

    // La latenza si chiude quando il fotogramma aggiornato e' stato disegnato:
    // due fotogrammi dopo l'aggiornamento, non subito dopo la chiamata.
    if (pendingTouch.current !== null) {
      const t0 = pendingTouch.current;
      pendingTouch.current = null;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => setLatencyMs(performance.now() - t0)),
      );
    }
  }, [cells, selected, brushMode, labelId]);

  /** Aggiunge alla selezione la cella sotto un punto, in coordinate del muro. */
  const paintAtWall = useCallback(
    (x: number, y: number, mode: BrushMode) => {
      const m = map;
      const overlay = overlayRef.current;
      if (!m || !overlay) return 0;

      const t0 = performance.now();
      let key: string | null = null;

      if (mode === "geometrico") {
        const lngLat = m.unproject([x, y]);
        key = cellAt(lngLat.lng, lngLat.lat, SPEC).key;
      } else {
        const info = overlay.pickObject({ x, y, radius: 6 });
        key = (info?.object as HexCell | undefined)?.key ?? null;
      }

      const elapsed = performance.now() - t0;
      setResolveMs(elapsed);
      if (!key || selectedRef.current.has(key)) return elapsed;

      pendingTouch.current = t0;
      setSelected((prev) => new Set(prev).add(key as string));
      return elapsed;
    },
    [map],
  );

  /** Converte le coordinate del puntatore nello spazio logico del muro. */
  const paintFromPointer = useCallback(
    (clientX: number, clientY: number, target: HTMLElement) => {
      const rect = target.getBoundingClientRect();
      paintAtWall(
        ((clientX - rect.left) / rect.width) * WIDTH,
        ((clientY - rect.top) / rect.height) * HEIGHT,
        brushMode,
      );
    },
    [paintAtWall, brushMode],
  );


  /**
   * Pennellata eseguita dalla pagina, identica nelle due modalita'.
   *
   * Serve perche' un trascinamento fatto a mano non e' ripetibile: cambia
   * velocita', lunghezza e numero di celle attraversate, e i due modi non
   * sarebbero confrontabili.
   */
  const autoRun = useRef(false);
  useEffect(() => {
    if (autoRun.current || !map) return;
    if (!new URLSearchParams(window.location.search).has("run")) return;
    autoRun.current = true;

    (async () => {
      const rows: Record<string, unknown>[] = [];

      for (const mode of ["geometrico", "grafico"] as BrushMode[]) {
        setBrushMode(mode);
        setSelected(new Set());
        await wait(1200);

        setAutoStep(`pennellata ${mode}`);

        let strokeRaf = 0;
        let steps = 0;
        let resolveTotal = 0;
        const start = performance.now();

        const stroke = () => {
          const t = (performance.now() - start) / 1000;
          const x = WIDTH * 0.2 + ((t * 0.35) % 1) * WIDTH * 0.6;
          const y = HEIGHT * 0.5 + Math.sin(t * 2.4) * HEIGHT * 0.25;
          resolveTotal += paintAtWall(x, y, mode) ?? 0;
          steps += 1;
          strokeRaf = requestAnimationFrame(stroke);
        };
        strokeRaf = requestAnimationFrame(stroke);

        const sample = await measure(4000);
        cancelAnimationFrame(strokeRaf);

        rows.push({
          test: "T7",
          scenario: `pennello ${mode} · trascinamento continuo`,
          width: WIDTH,
          height: HEIGHT,
          ...sample,
          note: `risoluzione ${(resolveTotal / Math.max(1, steps)).toFixed(2)} ms per cella, ${steps} passi`,
        });
        setAutoStep(`${mode}: fatto`);
        await wait(500);
      }

      await fetch("/api/bench", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          takenAt: new Date().toISOString(),
          mode: new URLSearchParams(window.location.search).get("mode") ?? "T7",
          suite: "t7",
          userAgent: navigator.userAgent,
          rows,
        }),
      });
      setAutoStep("salvato");
    })();
  }, [map, paintAtWall]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "b" || e.key === "B")
        setBrushMode((v) => (v === "geometrico" ? "grafico" : "geometrico"));
      if (e.key === "r" || e.key === "R") {
        setSelected(new Set());
        setLatencyMs(null);
      }
      if (e.key === "f" || e.key === "F")
        map?.flyTo({ center: TARGET, zoom: 11, pitch: 58, duration: 2500, essential: true });
      if (e.key === "g" || e.key === "G")
        map?.flyTo({ center: TARGET, zoom: 7.6, pitch: 50, duration: 2500, essential: true });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [map]);

  return (
    <main className="h-screen w-screen overflow-hidden bg-black">
      <Stage width={WIDTH} height={HEIGHT}>
        <div
          className="absolute inset-0 z-10"
          onPointerDown={(e) => {
            setDragging(true);
            e.currentTarget.setPointerCapture(e.pointerId);
            paintFromPointer(e.clientX, e.clientY, e.currentTarget);
          }}
          onPointerMove={(e) => {
            if (dragging) paintFromPointer(e.clientX, e.clientY, e.currentTarget);
          }}
          onPointerUp={(e) => {
            setDragging(false);
            e.currentTarget.releasePointerCapture(e.pointerId);
          }}
        />
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
          <HudPanel title="T7 — interazioni">
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

          <HudPanel title="pennello">
            <Row label="modo" value={brushMode} tone="good" />
            <Row
              label="risoluzione della cella"
              value={resolveMs === null ? "—" : `${resolveMs.toFixed(2)} ms`}
              tone={resolveMs !== null && resolveMs > 5 ? "bad" : "good"}
            />
            <Row
              label="dal tocco al disegno"
              value={latencyMs === null ? "—" : `${latencyMs.toFixed(0)} ms`}
              tone={
                latencyMs === null ? "normal" : latencyMs > 100 ? "bad" : latencyMs > 50 ? "warn" : "good"
              }
            />
            <Row label="celle selezionate" value={selected.size} />
            <Row label="stato" value={autoStep ?? (dragging ? "trascinamento" : "fermo")} />
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
              <span>trascina per dipingere</span>
              <span>
                <b className="text-white">B</b> geometrico / grafico
              </span>
              <span>
                <b className="text-white">F</b> volo ravvicinato
              </span>
              <span>
                <b className="text-white">G</b> volo indietro
              </span>
              <span>
                <b className="text-white">R</b> azzera
              </span>
            </div>
          </HudPanel>
        </div>
      </Hud>
    </main>
  );
}
