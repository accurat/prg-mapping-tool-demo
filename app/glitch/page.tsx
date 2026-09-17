"use client";

import { ArcLayer, ColumnLayer, MapLibreOverlay, ScatterplotLayer } from "deck.gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Hud, HudPanel, Row } from "@/components/lab/Hud";
import { MapSurface, type MapHandle } from "@/components/lab/MapSurface";
import { Stage } from "@/components/lab/Stage";
import { makeHexGrid, type HexCell } from "@/lib/lab/hexGrid";
import { makeStorePoints, type StorePoint } from "@/lib/lab/points";
import { makeRoutes, type Route } from "@/lib/lab/routes";
import { under } from "@/lib/lab/map";

const WIDTH = 5760;
const HEIGHT = 1080;
const TARGET: [number, number] = [-94.5786, 39.0997];
const STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

/**
 * Pagina di diagnosi del taglio orizzontale in modalita' interlacciata.
 *
 * Ipotesi: in interlacciato deck.gl adotta i piani di profondita' di MapLibre,
 * che li calcola per il proprio contenuto — sostanzialmente il suolo. Geometria
 * molto alta esce dal tronco di visuale e viene tagliata; siccome i piani
 * vengono ricalcolati a ogni fotogramma mentre la camera ruota, il taglio si
 * sposta di fotogramma in fotogramma.
 *
 * Qui si varia l'altezza massima delle colonne e si catturano fotogrammi
 * consecutivi dall'interno del ciclo di disegno.
 */
const HEIGHTS = [500, 2000, 9000, 26000, 80000];

/** Altezza dell'arco come frazione della distanza fra i due capi. */
const ARC_HEIGHTS = [0.05, 0.2, 0.5, 1];

type Subject = "colonne" | "archi" | "punti";
const SUBJECTS: Subject[] = ["colonne", "archi", "punti"];

export default function GlitchPage() {
  const [map, setMap] = useState<MapHandle | null>(null);
  const [maxElevation, setMaxElevation] = useState(26000);
  const [subject, setSubject] = useState<Subject>("colonne");
  const [arcHeight, setArcHeight] = useState(0.5);
  const [picking, setPicking] = useState(false);
  // Fissata all'apertura: cambiarla rimonterebbe la mappa, e la cattura
  // partirebbe prima che i layer siano di nuovo in scena.
  const [interleaved] = useState(
    () =>
      typeof window === "undefined" ||
      new URLSearchParams(window.location.search).get("modo") !== "sovrapposto",
  );
  const [spinning, setSpinning] = useState(true);
  const [status, setStatus] = useState("pronto");
  const [planes, setPlanes] = useState<string>("—");
  const [labelId, setLabelId] = useState<string | undefined>();

  const overlayRef = useRef<MapLibreOverlay | null>(null);
  const capture = useRef<{ left: number; frames: string[]; label: string } | null>(null);

  const cells = useMemo(
    () => makeHexGrid({ center: TARGET, count: 2000, cellRadiusMeters: 3000 }),
    [],
  );
  const routes = useMemo(() => makeRoutes({ center: TARGET, count: 500 }), []);
  const points = useMemo(
    () => makeStorePoints({ center: TARGET, count: 27000, spreadDeg: 4 }),
    [],
  );

  const handleReady = useCallback((m: MapHandle) => {
    m.jumpTo({ center: TARGET, zoom: 8.2, pitch: 62, bearing: 0 });
    setLabelId(m.getStyle().layers.find((l) => l.type === "symbol")?.id);
    setMap(m);
  }, []);

  useEffect(() => {
    if (!map) return;
    const overlay = new MapLibreOverlay({ interleaved, layers: [] });
    map.addControl(overlay);
    overlayRef.current = overlay;
    return () => {
      overlayRef.current = null;
      map.removeControl(overlay);
    };
  }, [map, interleaved]);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    // Inserire il layer a meta' della pila della mappa la costringe a spezzare
    // il proprio disegno in piu' passaggi. Con `sotto=no` si prova a metterlo
    // in cima, per capire se e' quello a produrre i riquadri.
    const insertUnder =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("sotto") !== "no";
    const placement = interleaved && insertUnder ? under(labelId) : {};

    const layer =
      subject === "colonne"
        ? new ColumnLayer<HexCell>({
            id: "colonne",
            data: cells,
            diskResolution: 6,
            radius: 2600,
            extruded: true,
            getPosition: (d) => d.position,
            getElevation: (d) => d.value * maxElevation,
            getFillColor: (d) => [70 + d.value * 150, 120 + d.value * 90, 200, 240],
            updateTriggers: { getElevation: maxElevation },
            ...placement,
          })
        : subject === "archi"
          ? new ArcLayer<Route>({
              id: "archi",
              data: routes,
              getSourcePosition: (d) => d.source,
              getTargetPosition: (d) => d.target,
              getSourceColor: () => [70, 120, 200, 200],
              getTargetColor: () => [255, 160, 90, 230],
              getWidth: 6,
              widthUnits: "pixels",
              // L'apice dell'arco e' una frazione della distanza fra i capi:
              // su rotte di centinaia di chilometri diventano quote enormi,
              // molto oltre quello che la mappa si aspetta di dover inquadrare.
              getHeight: arcHeight,
              updateTriggers: { getHeight: arcHeight },
              ...placement,
            })
          : new ScatterplotLayer<StorePoint>({
              id: "punti",
              data: points,
              pickable: picking,
              radiusUnits: "pixels",
              getRadius: 6,
              getPosition: (d) => d.position,
              getFillColor: (d) => [60 + d.value * 195, 140 + d.value * 80, 230, 230],
              ...placement,
            });

    overlay.setProps({ layers: [layer] });
  }, [cells, routes, points, subject, maxElevation, arcHeight, picking, interleaved, labelId]);

  /**
   * Interrogazione a ogni fotogramma, che e' cio' che fa il browser da solo
   * quando il puntatore si muove su un layer toccabile. Comporta un passaggio
   * di rendering aggiuntivo **dentro il contesto grafico della mappa**.
   */
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay || subject !== "punti" || !picking) return;
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = (now - start) / 1000;
      overlay.pickObject({
        x: WIDTH / 2 + Math.cos(t) * WIDTH * 0.3,
        y: HEIGHT / 2 + Math.sin(t * 1.3) * HEIGHT * 0.3,
        radius: 4,
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [subject, picking]);

  // Rotazione continua: e' durante la rotazione che il difetto si manifesta.
  useEffect(() => {
    if (!map || !spinning) return;
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      map.setBearing((((now - start) / 1000) * 30) % 360);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [map, spinning]);

  // Cattura dall'interno del ciclo di disegno: l'unico momento in cui il
  // contenuto del canvas e' quello del fotogramma corrente.
  useEffect(() => {
    if (!map) return;
    const onRender = () => {
      // `transform` non e' nell'interfaccia pubblica: si legge solo per
      // diagnosi, per vedere i piani che MapLibre passa al layer interlacciato.
      const t = (map as unknown as { transform?: Record<string, number> }).transform ?? {};
      const near = t._nearZ ?? t.nearZ;
      const far = t._farZ ?? t.farZ;
      setPlanes(
        near === undefined || far === undefined
          ? "non leggibili"
          : `vicino ${near.toFixed(0)} · lontano ${far.toFixed(0)}`,
      );

      const job = capture.current;
      if (!job || job.left <= 0) return;
      job.frames.push(map.getCanvas().toDataURL("image/png"));
      job.left -= 1;
      setStatus(`cattura: ${job.frames.length}`);

      if (job.left === 0) {
        const { frames, label } = job;
        capture.current = null;
        void fetch("/api/frames", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ label, frames }),
        }).then(() => setStatus(`salvati ${frames.length} fotogrammi in ${label}`));
      }
    };
    map.on("render", onRender);
    return () => {
      map.off("render", onRender);
    };
  }, [map]);

  const startCapture = useCallback(
    (height: string | number) => {
      capture.current = {
        left: 8,
        frames: [],
        label: `${interleaved ? "interlacciato" : "sovrapposto"}-${height}`,
      };
      setStatus("cattura in corso");
    },
    [interleaved],
  );

  // La sequenza automatica chiama sempre l'ultima versione, senza dipendere da
  // quando e' stato creato l'effetto.
  const captureRef = useRef(startCapture);
  useEffect(() => {
    captureRef.current = startCapture;
  }, [startCapture]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "h" || e.key === "H")
        setMaxElevation((v) => HEIGHTS[(HEIGHTS.indexOf(v) + 1) % HEIGHTS.length]);
      if (e.code === "Space") {
        e.preventDefault();
        setSpinning((v) => !v);
      }
      if (e.key === "c" || e.key === "C")
        startCapture(subject === "archi" ? `archi-${arcHeight}` : `${subject}-${maxElevation}m`);
      if (e.key === "s" || e.key === "S")
        setSubject((v) => SUBJECTS[(SUBJECTS.indexOf(v) + 1) % SUBJECTS.length]);
      if (e.key === "a" || e.key === "A")
        setArcHeight((v) => ARC_HEIGHTS[(ARC_HEIGHTS.indexOf(v) + 1) % ARC_HEIGHTS.length]);
      if (e.key === "t" || e.key === "T") setPicking((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [startCapture, maxElevation, subject, arcHeight]);

  // Sequenza automatica: tutte le altezze, in entrambe le modalita'.
  const auto = useRef(false);
  useEffect(() => {
    if (auto.current || !map) return;
    if (!new URLSearchParams(window.location.search).has("run")) return;
    auto.current = true;
    (async () => {
      const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

      setSubject("archi");
      for (const h of ARC_HEIGHTS) {
        setArcHeight(h);
        await pause(2000);
        captureRef.current(`archi-${h}`);
        await pause(2500);
      }

      setSubject("punti");
      for (const p of [false, true]) {
        setPicking(p);
        await pause(2000);
        captureRef.current(`punti-${p ? "toccabili" : "non-toccabili"}`);
        await pause(2500);
      }

      setStatus("sequenza completata");
    })();
  }, [map]);

  return (
    <main className="h-screen w-screen overflow-hidden bg-black">
      <Stage width={WIDTH} height={HEIGHT}>
        <MapSurface
          key={String(interleaved)}
          width={WIDTH}
          height={HEIGHT}
          styleUrl={STYLE}
          projection="mercator"
          preserveDrawingBuffer
          onReady={handleReady}
        />
      </Stage>

      <Hud>
        <HudPanel title="diagnosi del taglio orizzontale">
          <Row label="modalita'" value={interleaved ? "interlacciato" : "sovrapposto"} tone="good" />
          <Row label="soggetto" value={subject} tone="good" />
          <Row label="altezza massima colonne" value={`${(maxElevation / 1000).toFixed(1)} km`} />
          <Row label="altezza archi" value={`${arcHeight} della distanza`} />
          <Row label="punti toccabili" value={picking ? "si, con interrogazione continua" : "no"} />
          <Row label="piani di MapLibre" value={planes} />
          <Row label="rotazione" value={spinning ? "attiva" : "ferma"} />
          <Row label="stato" value={status} />
        </HudPanel>
        <HudPanel>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-white/60">
            <span>
              <b className="text-white">S</b> soggetto
            </span>
            <span>
              <b className="text-white">H</b> altezza colonne
            </span>
            <span>
              <b className="text-white">A</b> altezza archi
            </span>
            <span>
              <b className="text-white">T</b> toccabili
            </span>
            <span>
              <b className="text-white">C</b> cattura 8 fotogrammi consecutivi
            </span>
            <span>
              <b className="text-white">spazio</b> rotazione
            </span>
          </div>
        </HudPanel>
      </Hud>
    </main>
  );
}
