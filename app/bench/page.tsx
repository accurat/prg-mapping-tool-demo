"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GlSurface } from "@/components/lab/GlSurface";
import { MapSurface, type MapHandle } from "@/components/lab/MapSurface";
import { Stage } from "@/components/lab/Stage";
import { ColumnLayer, MapLibreOverlay } from "deck.gl";
import { makeHexGrid, type HexCell } from "@/lib/lab/hexGrid";
import { prefetchDescent, settle } from "@/lib/lab/map";
import { measure, wait, type Sample } from "@/lib/lab/measure";

const WALL = { width: 5760, height: 1080 };
const SINGLE = { width: 1920, height: 1080 };
const TARGET: [number, number] = [-94.5786, 39.0997];

const SOURCES = {
  carto: {
    label: "CARTO dark matter",
    url: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  },
  openfree: {
    label: "OpenFreeMap dark",
    url: "https://tiles.openfreemap.org/styles/dark",
  },
} as const;
type SourceKey = keyof typeof SOURCES;

const STARTS = {
  globe: { label: "dal globo", zoom: 0.4 },
  continental: { label: "continentale", zoom: 3.2 },
  state: { label: "statale", zoom: 6 },
} as const;

type Row = Sample & {
  test: string;
  scenario: string;
  width: number;
  height: number;
  note?: string;
};

type Scene =
  | { kind: "idle" }
  | { kind: "gl"; width: number; height: number; passes: number }
  | { kind: "map"; source: SourceKey };

export default function BenchPage() {
  const [scene, setScene] = useState<Scene>({ kind: "idle" });
  const [rows, setRows] = useState<Row[]>([]);
  const [step, setStep] = useState("in attesa");
  const [done, setDone] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const mapRef = useRef<MapHandle | null>(null);
  const mapReady = useRef<(() => void) | null>(null);
  const started = useRef(false);

  const handleMapReady = useCallback((map: MapHandle) => {
    mapRef.current = map;
    mapReady.current?.();
  }, []);

  /** Monta una sorgente di mappa e attende che sia pronta e assestata. */
  const mountMap = useCallback(async (source: SourceKey) => {
    mapRef.current = null;
    const ready = new Promise<void>((resolve) => {
      mapReady.current = resolve;
    });
    setScene({ kind: "map", source });
    await ready;
    const map = mapRef.current!;
    map.jumpTo({ center: TARGET, zoom: 11, pitch: 55, bearing: 0 });
    await settle(map, 20000);
    return map;
  }, []);

  useEffect(() => {
    if (started.current) return;
    const query = new URLSearchParams(window.location.search);
    if (!query.has("run")) return;
    started.current = true;
    const suite = query.get("suite") ?? "base";

    (async () => {
      const collected: Row[] = [];
      const push = (row: Row) => {
        collected.push(row);
        setRows([...collected]);
      };

      if (suite === "base") {
      // ---- T0: costo della sola superficie ----
      for (const passes of [1, 4, 8]) {
        setStep(`T0 · muro · ${passes} passaggi`);
        setScene({ kind: "gl", ...WALL, passes });
        await wait(700);
        push({
          test: "T0",
          scenario: `scena vuota, ${passes} passaggi di riempimento`,
          ...WALL,
          ...(await measure(5000)),
        });
      }

      setStep("T0 · singolo schermo");
      setScene({ kind: "gl", ...SINGLE, passes: 1 });
      await wait(700);
      push({
        test: "T0",
        scenario: "scena vuota, 1 passaggio di riempimento",
        ...SINGLE,
        ...(await measure(5000)),
      });

      // ---- T1 e T2, per ciascuna sorgente ----
      for (const source of Object.keys(SOURCES) as SourceKey[]) {
        const label = SOURCES[source].label;
        setStep(`carico ${label}`);
        const map = await mountMap(source);

        setStep(`T2 · ${label} · rotazione`);
        const orbit = spin(map, "bearing");
        push({
          test: "T2",
          scenario: `${label} · rotazione continua, inclinazione 55`,
          ...WALL,
          ...(await measure(5000, () => map.areTilesLoaded())),
        });
        orbit();

        setStep(`T2 · ${label} · zoom`);
        const zooming = spin(map, "zoom");
        push({
          test: "T2",
          scenario: `${label} · zoom continuo`,
          ...WALL,
          ...(await measure(5000, () => map.areTilesLoaded())),
        });
        zooming();

        // Solo la partenza dal globo: e' quella che il concept richiede, ed e'
        // quella che si e' rivelata peggiore. Con e senza precaricamento.
        for (const withPrefetch of [false, true]) {
          const start = STARTS.globe;
          const tag = withPrefetch ? "con precaricamento" : "senza precaricamento";
          setStep(`T1 · ${label} · ${tag}`);

          map.setProjection({ type: "globe" });
          map.jumpTo({ center: TARGET, zoom: start.zoom, pitch: 0, bearing: 0 });
          await settle(map, 6000);

          let prefetchNote = "";
          if (withPrefetch) {
            const report = await prefetchDescent(map, {
              center: TARGET,
              fromZoom: start.zoom,
              toZoom: 15.5,
              toPitch: 55,
            });
            prefetchNote = `precaricamento ${(report.durationMs / 1000).toFixed(1)}s in ${report.steps} passi, ${report.timedOut} scaduti; `;
          }

          const cleanStart = await settle(map, 6000);
          await wait(200);

          map.flyTo({ center: TARGET, zoom: 15.5, pitch: 55, duration: 6000, essential: true });
          const sample = await measure(6000, () => map.areTilesLoaded());

          const landed = performance.now();
          const settled = await settle(map, 15000);
          const settleMs = performance.now() - landed;

          push({
            test: "T1",
            scenario: `${label} · discesa dal globo · ${tag}`,
            ...WALL,
            ...sample,
            note: `${prefetchNote}assestamento ${(settleMs / 1000).toFixed(2)}s${settled ? "" : " (scaduto)"}, partenza ${cleanStart ? "pulita" : "con tessere in arrivo"}`,
          });
        }
      }

      }

      if (suite === "deck") {
        // ---- T3: deck.gl sopra la mappa, e T4a: costo delle colonne ----
        setStep("carico la mappa per deck.gl");
        const map = await mountMap("carto");
        map.jumpTo({ center: TARGET, zoom: 10.2, pitch: 55, bearing: 0 });
        await settle(map, 20000);

        const labelId = map.getStyle().layers.find((l) => l.type === "symbol")?.id;

        for (const interleaved of [false, true]) {
          const modeLabel = interleaved ? "interlacciato" : "sovrapposto";
          const overlay = new MapLibreOverlay({ interleaved, layers: [] });
          map.addControl(overlay);

          for (const count of [500, 2000, 10000]) {
            const cells = makeHexGrid({ center: TARGET, count, cellRadiusMeters: 900 });
            overlay.setProps({
              layers: [
                new ColumnLayer<HexCell>({
                  id: "colonne",
                  data: cells,
                  diskResolution: 6,
                  radius: 780,
                  extruded: true,
                  pickable: false,
                  getPosition: (d) => d.position,
                  getElevation: (d) => d.value * 6000,
                  getFillColor: (d) => [40 + d.value * 120, 90 + d.value * 110, 150, 210],
                  ...(interleaved && labelId ? { beforeId: labelId } : {}),
                }),
              ],
            });
            await wait(1200);

            setStep(`T3 · ${modeLabel} · ${count} colonne · fermo`);
            push({
              test: "T3",
              scenario: `${modeLabel} · ${count} colonne · camera ferma`,
              ...WALL,
              ...(await measure(4000, () => map.areTilesLoaded())),
            });

            setStep(`T3 · ${modeLabel} · ${count} colonne · rotazione`);
            const stop = spin(map, "bearing");
            push({
              test: "T3",
              scenario: `${modeLabel} · ${count} colonne · rotazione continua`,
              ...WALL,
              ...(await measure(4000, () => map.areTilesLoaded())),
            });
            stop();
            map.setBearing(0);
          }

          overlay.setProps({ layers: [] });
          await wait(300);
          map.removeControl(overlay);
        }
      }

      setScene({ kind: "idle" });
      setStep("salvataggio");

      const params = new URLSearchParams(window.location.search);
      const payload = {
        takenAt: new Date().toISOString(),
        mode: params.get("mode") ?? "sincronismo verticale attivo",
        suite: params.get("suite") ?? "base",
        userAgent: navigator.userAgent,
        devicePixelRatio: window.devicePixelRatio,
        hardwareConcurrency: navigator.hardwareConcurrency,
        rows: collected,
      };
      console.log("RISULTATI", payload);

      try {
        const res = await fetch("/api/bench", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        setSaved(res.ok ? "salvati in masterplan/results/runs.jsonl" : `errore ${res.status}`);
      } catch (err) {
        setSaved(`errore di rete: ${String(err)}`);
      }

      setStep("finito");
      setDone(true);
    })();
  }, [mountMap]);

  return (
    <main className="min-h-screen w-screen overflow-hidden bg-black text-white">
      <div className="fixed inset-0 z-0">
        {scene.kind === "gl" ? (
          <Stage width={scene.width} height={scene.height}>
            <GlSurface
              key={`${scene.width}-${scene.passes}`}
              width={scene.width}
              height={scene.height}
              passes={scene.passes}
            />
          </Stage>
        ) : null}
        {scene.kind === "map" ? (
          <Stage width={WALL.width} height={WALL.height}>
            <MapSurface
              key={scene.source}
              width={WALL.width}
              height={WALL.height}
              styleUrl={SOURCES[scene.source].url}
              projection="globe"
              onReady={handleMapReady}
            />
          </Stage>
        ) : null}
      </div>

      <div className="pointer-events-none relative z-10 p-5 font-mono text-xs">
        <div className="inline-block rounded border border-white/20 bg-black/80 px-4 py-3 backdrop-blur">
          <div className="text-sm">
            Banco di prova — <span className="text-amber-400">{step}</span>
            {done ? <span className="ml-2 text-emerald-400">completato</span> : null}
          </div>
          {saved ? <div className="mt-1 text-white/60">{saved}</div> : null}
          <div className="mt-1 text-white/40">
            {rows.length} misure · non spostare il fuoco da questa finestra
          </div>
          {rows.length > 0 ? (
            <table className="mt-3 border-separate border-spacing-x-4 text-[11px]">
              <thead className="text-white/35">
                <tr>
                  <th className="text-left">test</th>
                  <th className="text-left">scenario</th>
                  <th className="text-right">mediana</th>
                  <th className="text-right">ms</th>
                  <th className="text-right">p95</th>
                  <th className="text-right">peggiore</th>
                  <th className="text-right">tessere</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="text-white/50">{r.test}</td>
                    <td>{r.scenario}</td>
                    <td className="text-right">{r.median.toFixed(1)}</td>
                    <td className="text-right text-white/50">{r.medianMs.toFixed(2)}</td>
                    <td className="text-right text-white/50">{r.p95Ms.toFixed(2)}</td>
                    <td className="text-right">{r.min.toFixed(1)}</td>
                    <td className="text-right text-white/50">
                      {(r.unsettledShare * 100).toFixed(0)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      </div>
    </main>
  );
}

/**
 * Muove la camera in continuo per tutta la durata della misura.
 * Restituisce la funzione che ferma il movimento.
 */
function spin(map: MapHandle, mode: "bearing" | "zoom") {
  let raf = 0;
  const start = performance.now();
  const baseZoom = map.getZoom();

  const step = (now: number) => {
    const t = (now - start) / 1000;
    if (mode === "bearing") map.setBearing((t * 30) % 360);
    else map.setZoom(baseZoom + Math.sin(t * 0.8) * 2);
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}
