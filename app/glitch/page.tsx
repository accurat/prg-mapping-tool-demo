"use client";

import { ColumnLayer, MapLibreOverlay } from "deck.gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Hud, HudPanel, Row } from "@/components/lab/Hud";
import { MapSurface, type MapHandle } from "@/components/lab/MapSurface";
import { Stage } from "@/components/lab/Stage";
import { makeHexGrid, type HexCell } from "@/lib/lab/hexGrid";
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

export default function GlitchPage() {
  const [map, setMap] = useState<MapHandle | null>(null);
  const [maxElevation, setMaxElevation] = useState(26000);
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
    overlay.setProps({
      layers: [
        new ColumnLayer<HexCell>({
          id: "colonne",
          data: cells,
          diskResolution: 6,
          radius: 2600,
          extruded: true,
          getPosition: (d) => d.position,
          getElevation: (d) => d.value * maxElevation,
          getFillColor: (d) => [70 + d.value * 150, 120 + d.value * 90, 200, 240],
          updateTriggers: { getElevation: maxElevation },
          ...(interleaved ? under(labelId) : {}),
        }),
      ],
    });
  }, [cells, maxElevation, interleaved, labelId]);

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
    (height: number) => {
      capture.current = {
        left: 8,
        frames: [],
        label: `${interleaved ? "interlacciato" : "sovrapposto"}-${height}m`,
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
      if (e.key === "c" || e.key === "C") startCapture(maxElevation);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [startCapture, maxElevation]);

  // Sequenza automatica: tutte le altezze, in entrambe le modalita'.
  const auto = useRef(false);
  useEffect(() => {
    if (auto.current || !map) return;
    if (!new URLSearchParams(window.location.search).has("run")) return;
    auto.current = true;
    (async () => {
      for (const h of HEIGHTS) {
        setMaxElevation(h);
        await new Promise((r) => setTimeout(r, 2000));
        captureRef.current(h);
        await new Promise((r) => setTimeout(r, 2500));
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
          <Row label="altezza massima colonne" value={`${(maxElevation / 1000).toFixed(1)} km`} />
          <Row label="piani di MapLibre" value={planes} />
          <Row label="rotazione" value={spinning ? "attiva" : "ferma"} />
          <Row label="stato" value={status} />
        </HudPanel>
        <HudPanel>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-white/60">
            <span>
              <b className="text-white">H</b> altezza
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
