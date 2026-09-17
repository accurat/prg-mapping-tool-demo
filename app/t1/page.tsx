"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Hud, HudPanel, Row, fpsTone } from "@/components/lab/Hud";
import { MapSurface, type MapHandle } from "@/components/lab/MapSurface";
import { Stage } from "@/components/lab/Stage";
import { prefetchDescent, settle, type PrefetchReport } from "@/lib/lab/map";
import { useFrameMeter } from "@/lib/lab/useFrameMeter";
import { useRenderTrust } from "@/lib/lab/useRenderTrust";

const WIDTH = 5760;
const HEIGHT = 1080;

/** Kansas City: la citta' usata come esempio in tutti i documenti di concept. */
const TARGET: [number, number] = [-94.5786, 39.0997];

const SOURCES = {
  carto: { label: "CARTO dark matter (93 livelli)", url: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json" },
  openfree: { label: "OpenFreeMap dark (47 livelli)", url: "https://tiles.openfreemap.org/styles/dark" },
} as const;
type SourceKey = keyof typeof SOURCES;

/** Le tre partenze previste dal masterplan. */
const STARTS = {
  globe: { label: "1a — dal globo", zoom: 0.4 },
  continental: { label: "1b — continentale", zoom: 3.2 },
  state: { label: "1c — statale", zoom: 6 },
} as const;
type StartKey = keyof typeof STARTS;

const DURATIONS = [3000, 6000, 12000];
const ARRIVAL_ZOOM = 15.5;


export default function T1Page() {
  const [sourceKey, setSourceKey] = useState<SourceKey>("carto");
  const [projection, setProjection] = useState<"globe" | "mercator">("globe");
  const [startKey, setStartKey] = useState<StartKey>("globe");
  const [duration, setDuration] = useState(6000);
  const [scale, setScale] = useState(0);

  const [zoom, setZoom] = useState(0);
  const [flying, setFlying] = useState(false);
  const [settleMs, setSettleMs] = useState<number | null>(null);
  const [bufferSize, setBufferSize] = useState<string>("...");
  const [preflight, setPreflight] = useState<"settled" | "timeout" | null>(null);
  const [prefetchOn, setPrefetchOn] = useState(true);
  const [prefetch, setPrefetch] = useState<PrefetchReport | null>(null);
  const [prefetching, setPrefetching] = useState(false);

  const mapRef = useRef<MapHandle | null>(null);
  const { stats, reset, recording, startRecording, stopRecording } = useFrameMeter();
  const trust = useRenderTrust(stats.medianMs);

  const handleReady = useCallback((map: MapHandle) => {
    mapRef.current = map;
    const canvas = map.getCanvas();
    setBufferSize(`${canvas.width} x ${canvas.height}`);
    map.on("zoom", () => setZoom(map.getZoom()));
    setZoom(map.getZoom());
  }, []);

  const runDescent = useCallback(async () => {
    const map = mapRef.current;
    if (!map || flying) return;

    const start = STARTS[startKey];
    map.jumpTo({ center: TARGET, zoom: start.zoom, pitch: 0, bearing: 0 });
    setSettleMs(null);
    setPrefetch(null);

    if (prefetchOn) {
      setPrefetching(true);
      setPrefetch(
        await prefetchDescent(map, {
          center: TARGET,
          fromZoom: start.zoom,
          toZoom: ARRIVAL_ZOOM,
          toPitch: 55,
        }),
      );
      setPrefetching(false);
    }

    // Si attende che la partenza sia assestata, altrimenti la discesa
    // erediterebbe le tessere ancora in arrivo dal salto iniziale.
    const how = (await settle(map, 3000)) ? "settled" : "timeout";
    setPreflight(how);

    setFlying(true);
    startRecording(
      `${STARTS[startKey].label} · ${SOURCES[sourceKey].label} · ${duration / 1000}s · ${projection}`,
      () => map.areTilesLoaded(),
    );

    map.flyTo({
      center: TARGET,
      zoom: ARRIVAL_ZOOM,
      pitch: 55,
      duration,
      essential: true,
    });

    map.once("moveend", async () => {
      stopRecording();
      setFlying(false);
      const landed = performance.now();
      await settle(map, 15000);
      setSettleMs(performance.now() - landed);
    });
  }, [duration, flying, prefetchOn, projection, sourceKey, startKey, startRecording, stopRecording]);

  // Avvio automatico con ?auto=1: serve a poter catturare fotogrammi durante la
  // discesa dall'esterno, senza dipendere dal momento in cui si preme un tasto.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current || !mapRef.current) return;
    if (!new URLSearchParams(window.location.search).has("auto")) return;
    autoStarted.current = true;
    window.setTimeout(runDescent, 2500);
  }, [runDescent, bufferSize]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        runDescent();
        return;
      }
      if (e.key === "1") setStartKey("globe");
      if (e.key === "2") setStartKey("continental");
      if (e.key === "3") setStartKey("state");
      if (e.key === "s" || e.key === "S")
        setSourceKey((k) => (k === "carto" ? "openfree" : "carto"));
      if (e.key === "p" || e.key === "P")
        setProjection((p) => (p === "globe" ? "mercator" : "globe"));
      if (e.key === "d" || e.key === "D")
        setDuration((d) => DURATIONS[(DURATIONS.indexOf(d) + 1) % DURATIONS.length]);
      if (e.key === "r" || e.key === "R") reset();
      if (e.key === "f" || e.key === "F") setPrefetchOn((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reset, runDescent]);

  const bufferOk = bufferSize === `${WIDTH} x ${HEIGHT}`;

  return (
    <main className="h-screen w-screen overflow-hidden bg-black">
      <Stage width={WIDTH} height={HEIGHT} onScaleChange={setScale}>
        <MapSurface
          key={sourceKey}
          width={WIDTH}
          height={HEIGHT}
          styleUrl={SOURCES[sourceKey].url}
          projection={projection}
          onReady={handleReady}
        />
      </Stage>

      <Hud>
        <div className="flex items-start gap-3">
          <HudPanel title="T1 — la discesa">
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
            <Row label="zoom" value={zoom.toFixed(2)} />
            <Row
              label="stato"
              value={prefetching ? "precaricamento" : flying ? "discesa in corso" : "fermo"}
              tone={prefetching || flying ? "warn" : "normal"}
            />
            <Row
              label="misura attendibile"
              value={trust.suspect ? "NO" : "si"}
              tone={trust.suspect ? "bad" : "good"}
            />
          </HudPanel>

          <HudPanel title="ultima discesa">
            {recording ? (
              <>
                <Row
                  label="mediana"
                  value={`${recording.median.toFixed(1)}/s`}
                  tone={fpsTone(recording.median)}
                />
                <Row
                  label="peggior fotogramma"
                  value={`${recording.min.toFixed(1)}/s`}
                  tone={fpsTone(recording.min)}
                />
                <Row
                  label="tessere in ritardo"
                  value={`${(recording.unsettledShare * 100).toFixed(0)}% della discesa`}
                  tone={
                    recording.unsettledShare > 0.5
                      ? "bad"
                      : recording.unsettledShare > 0.2
                        ? "warn"
                        : "good"
                  }
                />
                <Row
                  label="assestamento"
                  value={settleMs === null ? "in corso..." : `${(settleMs / 1000).toFixed(2)} s`}
                  tone={settleMs !== null && settleMs > 2000 ? "warn" : "normal"}
                />
                <Row label="fotogrammi" value={recording.frames} />
                <Row
                  label="partenza pulita"
                  value={preflight === "timeout" ? "no, tessere in arrivo" : "si"}
                  tone={preflight === "timeout" ? "warn" : "normal"}
                />
                <div className="mt-1 max-w-md text-[10px] leading-4 text-white/35">
                  {recording.label}
                </div>
              </>
            ) : (
              <div className="text-white/40">premi spazio per la discesa</div>
            )}
          </HudPanel>

          <HudPanel title="impostazioni">
            <Row label="sorgente" value={SOURCES[sourceKey].label} />
            <Row label="proiezione" value={projection} />
            <Row label="partenza" value={STARTS[startKey].label} />
            <Row label="durata" value={`${duration / 1000} s`} />
            <Row
              label="precaricamento"
              value={
                prefetchOn
                  ? prefetch
                    ? `attivo, ${(prefetch.durationMs / 1000).toFixed(1)}s, ${prefetch.timedOut} passi scaduti`
                    : "attivo"
                  : "spento"
              }
              tone={prefetchOn ? "good" : "warn"}
            />
            <Row
              label="buffer reale"
              value={bufferOk ? `${bufferSize} ok` : bufferSize}
              tone={bufferOk ? "good" : "bad"}
            />
            <Row label="riduzione ottica" value={`${(scale * 100).toFixed(1)}%`} />
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
              <button
                type="button"
                onClick={runDescent}
                disabled={flying}
                className="rounded border border-white/25 px-2 py-0.5 text-white hover:bg-white/10 disabled:opacity-40"
              >
                discesa (spazio)
              </button>
              <span>
                <b className="text-white">1 2 3</b> partenza
              </span>
              <span>
                <b className="text-white">S</b> sorgente
              </span>
              <span>
                <b className="text-white">P</b> proiezione
              </span>
              <span>
                <b className="text-white">D</b> durata
              </span>
              <span>
                <b className="text-white">F</b> precaricamento
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
