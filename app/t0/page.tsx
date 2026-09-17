"use client";

import { useCallback, useEffect, useState } from "react";
import { GlSurface, type SurfaceInfo } from "@/components/lab/GlSurface";
import { Hud, HudPanel, Row, fpsTone } from "@/components/lab/Hud";
import { Stage } from "@/components/lab/Stage";
import { useFrameMeter } from "@/lib/lab/useFrameMeter";
import { useRenderTrust } from "@/lib/lab/useRenderTrust";

const WALL = { width: 5760, height: 1080, label: "muro 5760x1080" };
const SINGLE = { width: 1920, height: 1080, label: "singolo 1920x1080" };

export default function T0Page() {
  const [target, setTarget] = useState(WALL);
  const [passes, setPasses] = useState(1);
  const [scale, setScale] = useState(0);
  const [info, setInfo] = useState<SurfaceInfo | null>(null);
  const { stats, reset } = useFrameMeter();
  const trust = useRenderTrust(stats.medianMs);

  // La scena viene ricreata da capo quando cambia risoluzione o numero di
  // passaggi: la chiave costringe React a smontare il canvas invece di
  // riusarlo, cosi' ogni misura parte pulita.
  const sceneKey = `${target.width}x${target.height}@${passes}`;

  useEffect(() => {
    reset();
    // reset e' stabile per costruzione.
  }, [sceneKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleInfo = useCallback((next: SurfaceInfo) => setInfo(next), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "1") setTarget(WALL);
      if (e.key === "2") setTarget(SINGLE);
      if (e.key === "r" || e.key === "R") reset();
      if (e.key === "+" || e.key === "=") setPasses((p) => Math.min(p + 1, 16));
      if (e.key === "-") setPasses((p) => Math.max(p - 1, 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reset]);

  const bufferMatches =
    info?.bufferWidth === target.width && info?.bufferHeight === target.height;
  const megapixels = (target.width * target.height) / 1_000_000;

  return (
    <main className="h-screen w-screen overflow-hidden bg-black">
      <Stage
        key={sceneKey}
        width={target.width}
        height={target.height}
        onScaleChange={setScale}
      >
        <GlSurface
          width={target.width}
          height={target.height}
          passes={passes}
          onInfo={handleInfo}
        />
      </Stage>

      <Hud>
        <div className="flex items-start gap-3">
          <HudPanel title="T0 — impianto">
            <Row
              label="fotogrammi mediana"
              value={`${stats.median.toFixed(1)}/s  (${stats.medianMs.toFixed(2)} ms)`}
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
            <Row label="campioni" value={stats.samples} />
            <Row
              label="misura attendibile"
              value={trust.suspect ? "NO" : "si"}
              tone={trust.suspect ? "bad" : "good"}
            />
          </HudPanel>

          <HudPanel title="superficie">
            <Row label="richiesta" value={`${target.width} x ${target.height}`} />
            <Row
              label="buffer reale"
              value={
                info
                  ? `${info.bufferWidth} x ${info.bufferHeight}${bufferMatches ? "  ok" : "  NON CORRISPONDE"}`
                  : "..."
              }
              tone={info ? (bufferMatches ? "good" : "bad") : "normal"}
            />
            <Row label="megapixel" value={megapixels.toFixed(2)} />
            <Row
              label="densita' schermo"
              value={info ? `${info.devicePixelRatio}x (non applicata al buffer)` : "..."}
            />
            <Row label="riduzione ottica" value={`${(scale * 100).toFixed(1)}%`} />
            <Row label="passaggi di riempimento" value={passes} />
            <Row label="scheda video" value={info?.renderer ?? "..."} />
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
              <b className="text-white">1</b> {WALL.label}
            </span>
            <span>
              <b className="text-white">2</b> {SINGLE.label}
            </span>
            <span>
              <b className="text-white">+ / -</b> passaggi di riempimento
            </span>
              <span>
                <b className="text-white">R</b> azzera le statistiche
              </span>
            </div>
          </HudPanel>
        </div>
      </Hud>
    </main>
  );
}
