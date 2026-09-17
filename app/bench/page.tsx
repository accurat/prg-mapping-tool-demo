"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GlSurface } from "@/components/lab/GlSurface";
import { MapSurface, type MapHandle } from "@/components/lab/MapSurface";
import { Stage } from "@/components/lab/Stage";
import {
  AmbientLight,
  ColumnLayer,
  DirectionalLight,
  HexagonLayer,
  LightingEffect,
  MapLibreOverlay,
  TripsLayer,
  ArcLayer,
} from "deck.gl";
import { makeHexGrid, type HexCell } from "@/lib/lab/hexGrid";
import { makeStorePoints, type StorePoint } from "@/lib/lab/points";
import { makeRoutes, toTripPaths, type Route, type TripPath } from "@/lib/lab/routes";
import { prefetchDescent, settle, under } from "@/lib/lab/map";
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


      if (suite === "cells") {
        // ---- T4: il rilievo ----
        setStep("carico la mappa per il rilievo");
        const map = await mountMap("carto");
        map.jumpTo({ center: TARGET, zoom: 10.2, pitch: 55, bearing: 0 });
        await settle(map, 20000);
        const labelId = map.getStyle().layers.find((l) => l.type === "symbol")?.id;

        const overlay = new MapLibreOverlay({ interleaved: true, layers: [] });
        map.addControl(overlay);

        const lighting = (shadows: boolean) =>
          new LightingEffect({
            ambient: new AmbientLight({ color: [255, 255, 255], intensity: 1.0 }),
            sun: new DirectionalLight({
              color: [255, 255, 255],
              intensity: 2.0,
              direction: [-1.2, -3, -1],
              _shadow: shadows,
            }),
          });

        // --- T4a e T4d: celle pronte, con e senza ombre ---
        for (const shadows of [false, true]) {
          for (const count of [2000, 10000]) {
            const cells = makeHexGrid({ center: TARGET, count, cellRadiusMeters: 900 });
            overlay.setProps({
              effects: [lighting(shadows)],
              layers: [
                new ColumnLayer<HexCell>({
                  id: "celle",
                  data: cells,
                  diskResolution: 6,
                  radius: 780,
                  extruded: true,
                  getPosition: (d) => d.position,
                  getElevation: (d) => d.value * 9000,
                  getFillColor: (d) => [40 + d.value * 130, 95 + d.value * 105, 155, 225],
                  ...under(labelId),
                }),
              ],
            });
            await wait(1500);

            const tag = shadows ? "con ombre" : "senza ombre";
            setStep(`T4a · ${count} celle · ${tag}`);
            const stop = spin(map, "bearing");
            push({
              test: "T4a",
              scenario: `${count} celle pronte · rotazione · ${tag}`,
              ...WALL,
              ...(await measure(4000, () => map.areTilesLoaded())),
            });
            stop();
            map.setBearing(0);
          }
        }

        // --- T4c: la transizione di altezza, il "respiro" ---
        {
          const cells = makeHexGrid({ center: TARGET, count: 10000, cellRadiusMeters: 900 });
          const build = (year: "oggi" | "prima") =>
            new ColumnLayer<HexCell>({
              id: "respiro",
              data: cells,
              diskResolution: 6,
              radius: 780,
              extruded: true,
              getPosition: (d) => d.position,
              getElevation: (d) => (year === "oggi" ? d.value : 1 - d.value * 0.8) * 9000,
              getFillColor: (d) => [40 + d.value * 130, 95 + d.value * 105, 155, 225],
              transitions: { getElevation: { duration: 1500 } },
              updateTriggers: { getElevation: year },
              ...under(labelId),
            });

          overlay.setProps({ effects: [lighting(true)], layers: [build("oggi")] });
          await wait(1500);

          setStep("T4c · transizione di altezza");
          overlay.setProps({ layers: [build("prima")] });
          push({
            test: "T4c",
            scenario: "10.000 celle · transizione di altezza 1,5s · con ombre",
            ...WALL,
            ...(await measure(1800, () => map.areTilesLoaded())),
          });
        }

        // --- T4b: aggregazione a runtime ---
        map.jumpTo({ center: TARGET, zoom: 7.4, pitch: 55, bearing: 0 });
        await settle(map, 20000);

        for (const gpu of [true, false]) {
          for (const count of [10000, 27000, 100000]) {
            const points = makeStorePoints({ center: TARGET, count });
            setStep(`T4b · ${count} punti · ${gpu ? "scheda video" : "processore"}`);

            let resolveAggregation: (ms: number) => void = () => {};
            const aggregated = new Promise<number>((r) => (resolveAggregation = r));
            const t0 = performance.now();
            let reported = false;

            overlay.setProps({
              effects: [lighting(false)],
              layers: [
                new HexagonLayer<StorePoint>({
                  id: `aggregate-${gpu}-${count}`,
                  data: points,
                  radius: 3000,
                  extruded: true,
                  gpuAggregation: gpu,
                  getPosition: (d) => d.position,
                  getElevationWeight: (d) => d.value,
                  elevationScale: 120,
                  onSetElevationDomain: () => {
                    if (reported) return;
                    reported = true;
                    resolveAggregation(performance.now() - t0);
                  },
                  ...under(labelId),
                }),
              ],
            });

            // Il tempo di aggregazione e il peggior fotogramma del periodo:
            // il primo dice quanto si attende, il secondo quanto si blocca.
            const timeout = new Promise<number>((r) => window.setTimeout(() => r(-1), 20000));
            const [ms, sample] = await Promise.all([
              Promise.race([aggregated, timeout]),
              measure(2500, () => map.areTilesLoaded()),
            ]);

            push({
              test: "T4b",
              scenario: `${count.toLocaleString("it-IT")} punti · aggregazione su ${gpu ? "scheda video" : "processore"}`,
              ...WALL,
              ...sample,
              note: ms < 0 ? "aggregazione non conclusa entro 20s" : `aggregazione ${ms.toFixed(0)} ms`,
            });

            await wait(500);
          }
        }

        overlay.setProps({ layers: [] });
        await wait(300);
        map.removeControl(overlay);
      }


      if (suite === "arcs") {
        // ---- T5: archi e flusso ----
        setStep("carico la mappa per gli archi");
        const map = await mountMap("carto");
        map.jumpTo({ center: TARGET, zoom: 5.4, pitch: 50, bearing: 0 });
        await settle(map, 20000);
        const labelId = map.getStyle().layers.find((l) => l.type === "symbol")?.id;

        const overlay = new MapLibreOverlay({ interleaved: true, layers: [] });
        map.addControl(overlay);

        // --- archi statici ---
        for (const count of [500, 5000, 50000]) {
          const routes = makeRoutes({ center: TARGET, count });
          overlay.setProps({
            layers: [
              new ArcLayer<Route>({
                id: "archi",
                data: routes,
                getSourcePosition: (d) => d.source,
                getTargetPosition: (d) => d.target,
                getSourceColor: () => [70, 120, 200, 180],
                getTargetColor: (d) => [255, 190 - d.weight * 90, 90, 220],
                getWidth: 6,
                widthUnits: "pixels",
                getHeight: (d) => 0.4 + d.weight * 0.6,
                ...under(labelId),
              }),
            ],
          });
          await wait(1200);

          setStep(`T5 · ${count} archi statici · rotazione`);
          const stop = spin(map, "bearing");
          push({
            test: "T5",
            scenario: `${count.toLocaleString("it-IT")} archi statici · rotazione`,
            ...WALL,
            ...(await measure(4000, () => map.areTilesLoaded())),
          });
          stop();
          map.setBearing(0);
        }

        // --- flusso animato ---
        const CYCLE = 1000;
        for (const count of [500, 5000, 50000]) {
          const trips = toTripPaths(makeRoutes({ center: TARGET, count }), 24, CYCLE);
          let time = 0;
          let raf = 0;
          const tick = () => {
            time = (time + 4) % CYCLE;
            overlay.setProps({
              layers: [
                new TripsLayer<TripPath>({
                  id: "flusso",
                  data: trips,
                  getPath: (d) => d.path,
                  getTimestamps: (d) => d.timestamps,
                  getColor: (d) => [255, 190 - d.weight * 90, 90],
                  widthUnits: "pixels",
                  getWidth: 6,
                  trailLength: CYCLE * 0.25,
                  currentTime: time,
                  ...under(labelId),
                }),
              ],
            });
            raf = requestAnimationFrame(tick);
          };
          raf = requestAnimationFrame(tick);
          await wait(1500);

          setStep(`T5 · ${count} rotte in flusso animato`);
          push({
            test: "T5",
            scenario: `${count.toLocaleString("it-IT")} rotte · flusso animato`,
            ...WALL,
            ...(await measure(4000, () => map.areTilesLoaded())),
            note: `${(count * 24).toLocaleString("it-IT")} punti di percorso`,
          });
          cancelAnimationFrame(raf);
        }

        // --- il caso reale: poche rotte, da vicino, inclinate ---
        map.jumpTo({ center: TARGET, zoom: 8.4, pitch: 58, bearing: 0 });
        await settle(map, 20000);
        {
          const trips = toTripPaths(makeRoutes({ center: TARGET, count: 500 }), 24, CYCLE);
          let time = 0;
          let raf = 0;
          const tick = () => {
            time = (time + 4) % CYCLE;
            overlay.setProps({
              layers: [
                new TripsLayer<TripPath>({
                  id: "flusso-vicino",
                  data: trips,
                  getPath: (d) => d.path,
                  getTimestamps: (d) => d.timestamps,
                  getColor: (d) => [255, 190 - d.weight * 90, 90],
                  widthUnits: "pixels",
                  getWidth: 6,
                  trailLength: CYCLE * 0.25,
                  currentTime: time,
                  ...under(labelId),
                }),
              ],
            });
            raf = requestAnimationFrame(tick);
          };
          raf = requestAnimationFrame(tick);
          await wait(1500);

          setStep("T5 · 500 rotte in flusso, inquadratura ravvicinata");
          push({
            test: "T5",
            scenario: "500 rotte · flusso animato · inquadratura ravvicinata",
            ...WALL,
            ...(await measure(4000, () => map.areTilesLoaded())),
            note: "il caso reale del concept: poche rotte, da vicino, inclinate",
          });
          cancelAnimationFrame(raf);
        }

        overlay.setProps({ layers: [] });
        await wait(300);
        map.removeControl(overlay);
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
