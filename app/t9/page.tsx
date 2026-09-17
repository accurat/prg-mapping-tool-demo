"use client";

import {
  AmbientLight,
  ColumnLayer,
  DirectionalLight,
  LightingEffect,
  MapLibreOverlay,
} from "deck.gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Hud, HudPanel, Row } from "@/components/lab/Hud";
import { MapSurface, type MapHandle } from "@/components/lab/MapSurface";
import { Stage } from "@/components/lab/Stage";
import { makeHexGrid, type HexCell } from "@/lib/lab/hexGrid";
import { under } from "@/lib/lab/map";
import { legibility, MM_PER_PX } from "@/lib/lab/wall";

const WIDTH = 5760;
const HEIGHT = 1080;
const TARGET: [number, number] = [-94.5786, 39.0997];
const STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

/** Scale di lavoro: a ciascuna corrisponde una dimensione di cella sensata. */
const SCALES = [
  { label: "nazionale", zoom: 4.2, cellRadiusM: 45000, count: 2200 },
  { label: "stato", zoom: 6.4, cellRadiusM: 14000, count: 2600 },
  { label: "area urbana", zoom: 9.0, cellRadiusM: 3000, count: 3000 },
];

const EXAGGERATIONS = [1, 2, 4, 8];

const PALETTES = {
  piatta: {
    label: "piatta (colore fisso)",
    color: () => [90, 130, 180, 235] as [number, number, number, number],
  },
  chiaroscuro: {
    label: "chiaroscuro (altezza = luminosita')",
    color: (t: number) =>
      [30 + t * 210, 45 + t * 200, 70 + t * 175, 240] as [number, number, number, number],
  },
  caldofreddo: {
    label: "caldo-freddo (altezza = tinta)",
    color: (t: number) =>
      [40 + t * 215, 70 + t * 90, 190 - t * 150, 240] as [number, number, number, number],
  },
} as const;
type PaletteKey = keyof typeof PALETTES;

const TEXT_SIZES = [24, 36, 48, 64, 96, 140];

export default function T9Page() {
  const [map, setMap] = useState<MapHandle | null>(null);
  const [scaleIdx, setScaleIdx] = useState(1);
  const [exaggeration, setExaggeration] = useState(4);
  const [palette, setPalette] = useState<PaletteKey>("chiaroscuro");
  const [shadows, setShadows] = useState(true);
  const [showText, setShowText] = useState(true);
  const [labelId, setLabelId] = useState<string | undefined>();

  const overlayRef = useRef<MapLibreOverlay | null>(null);
  const scale = SCALES[scaleIdx];

  const cells = useMemo(
    () =>
      makeHexGrid({
        center: TARGET,
        count: scale.count,
        cellRadiusMeters: scale.cellRadiusM,
      }),
    [scale],
  );

  /**
   * Quanti pixel occupa una cella sullo schermo.
   * E' il numero che decide se il rilievo si legge: sotto una certa dimensione
   * le colonne smettono di essere oggetti e diventano trama.
   */
  const cellPx = useMemo(() => {
    const metersPerPx = (156543.03 * Math.cos((TARGET[1] * Math.PI) / 180)) / 2 ** scale.zoom;
    return (scale.cellRadiusM * 2) / metersPerPx;
  }, [scale]);

  const cellLegibility = legibility(cellPx);

  const handleReady = useCallback(
    (m: MapHandle) => {
      m.jumpTo({ center: TARGET, zoom: SCALES[1].zoom, pitch: 52, bearing: 0 });
      setLabelId(m.getStyle().layers.find((l) => l.type === "symbol")?.id);
      setMap(m);
    },
    [],
  );

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
    map?.easeTo({ zoom: scale.zoom, pitch: 52, duration: 500 });
  }, [map, scale]);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    const paint = PALETTES[palette].color;
    // L'esagerazione e' riferita all'altezza della cella: cosi' il rapporto fra
    // larghezza e altezza resta confrontabile fra le scale.
    const maxElevation = scale.cellRadiusM * 1.2 * exaggeration;

    overlay.setProps({
      effects: [
        new LightingEffect({
          ambient: new AmbientLight({ color: [255, 255, 255], intensity: 0.9 }),
          sun: new DirectionalLight({
            color: [255, 255, 255],
            intensity: 2.4,
            direction: [-1, -2.2, -1.4],
            _shadow: shadows,
          }),
        }),
      ],
      layers: [
        new ColumnLayer<HexCell>({
          id: "rilievo",
          data: cells,
          diskResolution: 6,
          radius: scale.cellRadiusM * 0.92,
          extruded: true,
          getPosition: (d) => d.position,
          getElevation: (d) => d.value * maxElevation,
          getFillColor: (d) => paint(d.value),
          updateTriggers: { getFillColor: palette, getElevation: exaggeration },
          ...under(labelId),
        }),
      ],
    });
  }, [cells, scale, exaggeration, palette, shadows, labelId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "z" || e.key === "Z") setScaleIdx((i) => (i + 1) % SCALES.length);
      if (e.key === "e" || e.key === "E")
        setExaggeration((v) => EXAGGERATIONS[(EXAGGERATIONS.indexOf(v) + 1) % EXAGGERATIONS.length]);
      if (e.key === "p" || e.key === "P") {
        const keys = Object.keys(PALETTES) as PaletteKey[];
        setPalette((v) => keys[(keys.indexOf(v) + 1) % keys.length]);
      }
      if (e.key === "o" || e.key === "O") setShadows((v) => !v);
      if (e.key === "l" || e.key === "L") setShowText((v) => !v);
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
        {showText ? (
          <div className="pointer-events-none absolute inset-0 flex items-end justify-end p-8">
            <div className="flex flex-col items-end gap-2">
              {TEXT_SIZES.map((px) => {
                const l = legibility(px);
                return (
                  <div key={px} className="flex items-baseline gap-6 text-white">
                    <span
                      className="font-mono"
                      style={{ fontSize: `${px}px`, lineHeight: 1 }}
                    >
                      Kansas City 4,2 M$
                    </span>
                    <span className="w-64 shrink-0 font-mono text-[22px] text-white/40">
                      {px}px · {l.mm.toFixed(0)}mm · {l.arcmin.toFixed(1)}&apos; · {l.verdict}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </Stage>

      <Hud>
        <div className="flex items-start gap-3">
          <HudPanel title="T9 — leggibilita' a dodici metri">
            <Row label="scala" value={scale.label} tone="good" />
            <Row label="raggio cella" value={`${(scale.cellRadiusM / 1000).toFixed(1)} km`} />
            <Row
              label="cella a schermo"
              value={`${cellPx.toFixed(0)} px · ${(cellPx * MM_PER_PX).toFixed(0)} mm`}
            />
            <Row
              label="angolo a 12 m"
              value={`${cellLegibility.arcmin.toFixed(1)}' — ${cellLegibility.verdict}`}
              tone={
                cellLegibility.verdict === "invisibile"
                  ? "bad"
                  : cellLegibility.verdict === "al limite"
                    ? "warn"
                    : "good"
              }
            />
            <Row label="esagerazione verticale" value={`${exaggeration}x`} />
            <Row label="palette" value={PALETTES[palette].label} />
            <Row label="ombre" value={shadows ? "attive" : "spente"} />
          </HudPanel>

          <HudPanel title="riferimenti fisici">
            <Row label="muro" value="6,0 m su 5760 px" />
            <Row label="un pixel vale" value={`${MM_PER_PX.toFixed(2)} mm`} />
            <Row label="soglia di visibilita'" value="1 minuto d'arco = 3,5 px" />
            <Row label="testo comodo" value="10 minuti d'arco = 34 px" />
          </HudPanel>
        </div>

        <HudPanel>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-white/60">
            <span>
              <b className="text-white">Z</b> scala
            </span>
            <span>
              <b className="text-white">E</b> esagerazione
            </span>
            <span>
              <b className="text-white">P</b> palette
            </span>
            <span>
              <b className="text-white">O</b> ombre
            </span>
            <span>
              <b className="text-white">L</b> provino di testo
            </span>
          </div>
        </HudPanel>
      </Hud>
    </main>
  );
}
