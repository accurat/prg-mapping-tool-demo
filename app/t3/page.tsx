"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DeckColumns, type DeckMode } from "@/components/lab/DeckColumns";
import { Hud, HudPanel, Row, fpsTone } from "@/components/lab/Hud";
import { MapSurface, type MapHandle } from "@/components/lab/MapSurface";
import { Stage } from "@/components/lab/Stage";
import { makeHexGrid } from "@/lib/lab/hexGrid";
import { useFrameMeter } from "@/lib/lab/useFrameMeter";
import { useRenderTrust } from "@/lib/lab/useRenderTrust";

const WIDTH = 5760;
const HEIGHT = 1080;
const TARGET: [number, number] = [-94.5786, 39.0997];
const STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

const COUNTS = [500, 2000, 10000];

export default function T3Page() {
  const [map, setMap] = useState<MapHandle | null>(null);
  const [mode, setMode] = useState<DeckMode>("sovrapposto");
  const [count, setCount] = useState(2000);
  const [spinning, setSpinning] = useState(false);
  const [labelLayerId, setLabelLayerId] = useState<string | null>(null);

  const { stats } = useFrameMeter();
  const trust = useRenderTrust(stats.medianMs);

  const cells = useMemo(
    () => makeHexGrid({ center: TARGET, count, cellRadiusMeters: 900 }),
    [count],
  );

  const handleReady = useCallback((m: MapHandle) => {
    m.jumpTo({ center: TARGET, zoom: 10.2, pitch: 55, bearing: 0 });

    // Il primo livello di etichette dello stile: e' sotto questo che i layer
    // vengono inseriti in modalita' interlacciata, ed e' anche la prova visiva
    // che l'interlacciamento funziona davvero.
    const symbol = m.getStyle().layers.find((l) => l.type === "symbol");
    setLabelLayerId(symbol?.id ?? null);

    setMap(m);
  }, []);

  useEffect(() => {
    if (!map || !spinning) return;
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      map.setBearing((((now - start) / 1000) * 25) % 360);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [map, spinning]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "m" || e.key === "M")
        setMode((v) => (v === "sovrapposto" ? "interlacciato" : "sovrapposto"));
      if (e.key === "n" || e.key === "N")
        setCount((c) => COUNTS[(COUNTS.indexOf(c) + 1) % COUNTS.length]);
      if (e.code === "Space") {
        e.preventDefault();
        setSpinning((v) => !v);
      }
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

      <DeckColumns
        map={map}
        cells={cells}
        mode={mode}
        radiusMeters={780}
        maxElevationMeters={6000}
        beforeId={labelLayerId ?? undefined}
      />

      <Hud>
        <div className="flex items-start gap-3">
          <HudPanel title="T3 — deck.gl su MapLibre">
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
            <Row label="modalita'" value={mode} tone="good" />
            <Row label="colonne" value={count.toLocaleString("it-IT")} />
            <Row
              label="inserite sotto"
              value={
                mode === "interlacciato" ? (labelLayerId ?? "nessun livello trovato") : "—"
              }
            />
            <Row label="rotazione" value={spinning ? "attiva" : "ferma"} />
          </HudPanel>

          <HudPanel title="prova di interlacciamento">
            <div className="max-w-sm leading-5 text-white/55">
              In modalita&apos; interlacciata le etichette della mappa devono
              risultare <b className="text-white">sopra</b> le colonne. In
              modalita&apos; sovrapposta le colonne coprono tutto.
            </div>
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
                <b className="text-white">N</b> numero di colonne
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
