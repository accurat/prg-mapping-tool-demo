"use client";

import {
  AmbientLight,
  ColumnLayer,
  DirectionalLight,
  LightingEffect,
  MapLibreOverlay,
} from "deck.gl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Hud, HudPanel, Row, fpsTone } from "@/components/lab/Hud";
import { MapSurface, type MapHandle } from "@/components/lab/MapSurface";
import { Stage } from "@/components/lab/Stage";
import { under } from "@/lib/lab/map";
import { loadRealStores, type RealStore } from "@/lib/lab/realStores";
import { useFrameMeter } from "@/lib/lab/useFrameMeter";
import { useRenderTrust } from "@/lib/lab/useRenderTrust";

const WIDTH = 5760;
const HEIGHT = 1080;
/**
 * Centro USA: latitudine moderata cosi' con pitch il sud resta in quadro.
 */
const TARGET: [number, number] = [-97.5, 37.5];
const STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

/**
 * Zoom iniziale del globo: abbastanza alto da riempire quasi tutta l'altezza
 * del muro 5760x1080.
 */
const START_ZOOM = 2.75;
/** Arrivo piu' stretto sugli contiguous US. */
const ARRIVAL_ZOOM = 5.1;
const ARRIVAL_PITCH = 55;
/**
 * Padding inferiore (px): sposta il vanishing point in alto nel viewport.
 * L'`offset` di jumpTo non fa questo — serve proprio padding/setPadding.
 */
const VIEW_PAD_BOTTOM = 520;

/** Altezza massima delle colonne (metri) all'arrivo. */
const DATA_HEIGHT_M = 90000;
/** Raggio colonna in metri. */
const COLUMN_RADIUS_M = 12000;

/** Velocita' di rotazione sul proprio asse (gradi di longitudine al secondo). */
const ORBIT_DEG_PER_S = 8;
/** Latitudine di riposo: leggermente a nord per inquadrare meglio i continenti. */
const ORBIT_LAT = 20;

type Phase = "orbita" | "discesa" | "colonne" | "navigabile";

const PHASE_LABEL: Record<Phase, string> = {
  orbita: "globo in orbita",
  discesa: "discesa sugli USA",
  colonne: "i negozi emergono",
  navigabile: "mappa navigabile",
};

/**
 * Illuminazione uniforme: ombre e luce laterale a overview continentale
 * tagliano gli Stati Uniti a meta' (ovest chiaro, est nero).
 */
function makeLighting() {
  return new LightingEffect({
    ambient: new AmbientLight({ color: [255, 255, 255], intensity: 2.4 }),
    sun: new DirectionalLight({
      color: [255, 255, 255],
      intensity: 0.55,
      direction: [0, -1, -0.35],
      _shadow: false,
    }),
  });
}

const LIGHT = makeLighting();

/** Colore caldo-freddo su 0..1 (stessa scala di t10). */
function valueColor(t: number, alpha = 235): [number, number, number, number] {
  return [40 + t * 215, 70 + t * 95, 195 - t * 150, alpha];
}

/** Interpola longitudine sul percorso piu' corto (gestisce l'antimeridiano). */
function lerpLng(from: number, to: number, t: number) {
  let delta = to - from;
  if (delta > 180) {
    delta -= 360;
  }
  if (delta < -180) {
    delta += 360;
  }
  return from + delta * t;
}

export default function P0Page() {
  const [map, setMap] = useState<MapHandle | null>(null);
  const [phase, setPhase] = useState<Phase>("orbita");
  const [labelId, setLabelId] = useState<string | undefined>();
  const [stores, setStores] = useState<RealStore[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const overlayRef = useRef<MapLibreOverlay | null>(null);
  const runId = useRef(0);
  const spinning = useRef(false);
  const spinRaf = useRef(0);

  const { stats } = useFrameMeter();
  const trust = useRenderTrust(stats.medianMs);

  useEffect(() => {
    let cancelled = false;
    void loadRealStores()
      .then((data) => {
        if (!cancelled) {
          setStores(data);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "errore di caricamento");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleReady = useCallback((m: MapHandle) => {
    m.jumpTo({ center: [TARGET[0], ORBIT_LAT], zoom: START_ZOOM, pitch: 0, bearing: 0 });
    const layers = m.getStyle().layers ?? [];
    // niente toponimi a overview/globo: a questa scala sono solo rumore
    layers
      .filter((l) => l.type === "symbol")
      .forEach((l) => {
        m.setLayoutProperty(l.id, "visibility", "none");
      });
    setLabelId(layers.find((l) => l.type === "symbol")?.id);
    setMap(m);
  }, []);

  useEffect(() => {
    if (!map) {
      return;
    }
    const overlay = new MapLibreOverlay({
      interleaved: true,
      layers: [],
      effects: [LIGHT],
    });
    map.addControl(overlay);
    overlayRef.current = overlay;
    return () => {
      overlayRef.current = null;
      map.removeControl(overlay);
    };
  }, [map]);

  const stopSpin = useCallback(() => {
    spinning.current = false;
    if (spinRaf.current) {
      cancelAnimationFrame(spinRaf.current);
      spinRaf.current = 0;
    }
  }, []);

  const startSpin = useCallback(
    (m: MapHandle) => {
      stopSpin();
      spinning.current = true;
      // camera fissa nello spazio: pitch/bearing a zero, gira solo la longitudine
      m.jumpTo({
        center: [m.getCenter().lng, ORBIT_LAT],
        zoom: START_ZOOM,
        pitch: 0,
        bearing: 0,
      });
      const origin = performance.now();
      const baseLng = m.getCenter().lng;
      const step = (now: number) => {
        if (!spinning.current) {
          return;
        }
        // terra: ovest → est; da camera fissa la faccia centrale scorre verso ovest
        const raw = baseLng - ((now - origin) / 1000) * ORBIT_DEG_PER_S;
        const lng = ((((raw + 180) % 360) + 360) % 360) - 180;
        m.setCenter([lng, ORBIT_LAT]);
        spinRaf.current = requestAnimationFrame(step);
      };
      spinRaf.current = requestAnimationFrame(step);
    },
    [stopSpin],
  );

  useEffect(() => () => stopSpin(), [stopSpin]);

  /**
   * Disegna le colonne. `rise` 0..1 controlla fade + altezza dopo l'arrivo.
   */
  const draw = useCallback(
    (rise: number, data: RealStore[]) => {
      const overlay = overlayRef.current;
      if (!overlay) {
        return;
      }

      const ease = rise * rise * (3 - 2 * rise);

      overlay.setProps({
        layers: [
          new ColumnLayer<RealStore>({
            id: "negozi",
            data,
            diskResolution: 6,
            radius: COLUMN_RADIUS_M,
            extruded: true,
            // senza materiale il colore del dato non viene oscurato dal lighting
            material: false,
            getPosition: (d) => d.position,
            getElevation: (d) => d.heightValue * DATA_HEIGHT_M * ease,
            getFillColor: (d) => {
              const c = valueColor(d.colorValue);
              return [c[0], c[1], c[2], c[3] * ease];
            },
            updateTriggers: {
              getElevation: rise,
              getFillColor: rise,
            },
            ...under(labelId),
          }),
        ],
        effects: [LIGHT],
      });
    },
    [labelId],
  );

  const clearLayers = useCallback(() => {
    overlayRef.current?.setProps({ layers: [], effects: [LIGHT] });
  }, []);

  const animate = useCallback((ms: number, onFrame: (eased: number) => void) => {
    return new Promise<void>((resolve) => {
      const start = performance.now();
      const step = (now: number) => {
        const linear = Math.min(1, (now - start) / ms);
        onFrame(linear * linear * (3 - 2 * linear));
        if (linear >= 1) {
          return resolve();
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }, []);

  /** Entra in orbita appena la mappa e' pronta: niente zoom automatico. */
  useEffect(() => {
    if (!map) {
      return;
    }
    setPhase("orbita");
    startSpin(map);
  }, [map, startSpin]);

  const run = useCallback(async () => {
    const m = map;
    const data = stores;
    if (!m || !data || busy) {
      return;
    }

    const id = ++runId.current;
    const alive = () => id === runId.current;

    setBusy(true);
    // ferma il loop di spin ma riparte dalla posizione corrente: niente salto, niente sipario
    stopSpin();
    clearLayers();

    const from = m.getCenter();
    const fromZoom = m.getZoom();
    const fromPitch = m.getPitch();

    draw(0, data);
    setPhase("discesa");

    // un unico gesto: dalla longitudine in rotazione fino agli USA, zoom + pitch
    await animate(7000, (t) => {
      m.jumpTo({
        center: [lerpLng(from.lng, TARGET[0], t), from.lat + (TARGET[1] - from.lat) * t],
        zoom: fromZoom + (ARRIVAL_ZOOM - fromZoom) * t,
        pitch: fromPitch + (ARRIVAL_PITCH - fromPitch) * t,
        bearing: 0,
        padding: { top: 0, right: 0, bottom: VIEW_PAD_BOTTOM * t, left: 0 },
      });
    });
    if (!alive()) {
      setBusy(false);
      return;
    }
    // blocca il padding all'arrivo (altrimenti un pan successivo lo perde)
    m.setPadding({ top: 0, right: 0, bottom: VIEW_PAD_BOTTOM, left: 0 });

    setPhase("colonne");
    await animate(2600, (t) => draw(t, data));
    if (!alive()) {
      setBusy(false);
      return;
    }

    setPhase("navigabile");
    setBusy(false);
  }, [map, stores, busy, draw, animate, stopSpin, clearLayers]);

  const returnToOrbit = useCallback(() => {
    const m = map;
    if (!m) {
      return;
    }
    runId.current += 1;
    setBusy(false);
    stopSpin();
    clearLayers();
    m.setPadding({ top: 0, right: 0, bottom: 0, left: 0 });
    m.jumpTo({
      center: [m.getCenter().lng, ORBIT_LAT],
      zoom: START_ZOOM,
      pitch: 0,
      bearing: 0,
    });
    setPhase("orbita");
    startSpin(m);
  }, [map, stopSpin, clearLayers, startSpin]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        if (phase !== "orbita" || !stores) {
          return;
        }
        void run();
        return;
      }
      if (e.key === "r" || e.key === "R") {
        returnToOrbit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, stores, run, returnToOrbit]);

  return (
    <main className="h-screen w-screen overflow-hidden bg-black">
      <Stage width={WIDTH} height={HEIGHT}>
        <div className="relative" style={{ width: WIDTH, height: HEIGHT }}>
          <MapSurface
            width={WIDTH}
            height={HEIGHT}
            styleUrl={STYLE}
            projection="globe"
            onReady={handleReady}
          />
        </div>
      </Stage>

      <Hud>
        <div className="flex items-start gap-3">
          <HudPanel title="P0 — overview USA">
            <Row label="momento" value={PHASE_LABEL[phase]} tone="good" />
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
              label="peggiore (sessione)"
              value={`${stats.worst.toFixed(1)}/s`}
              tone={stats.worst ? fpsTone(stats.worst) : "normal"}
            />
            <Row
              label="misura attendibile"
              value={trust.suspect ? "NO" : "si"}
              tone={trust.suspect ? "bad" : "good"}
            />
          </HudPanel>

          <HudPanel title="dati">
            <Row label="negozi" value={stores ? stores.length : "…"} />
            <Row label="colore" value="comp_cvs" />
            <Row label="altezza" value="comp_walgreens" />
          </HudPanel>
        </div>

        <div className="flex flex-col gap-2">
          {loadError ? (
            <HudPanel>
              <div className="text-red-400">{loadError}</div>
            </HudPanel>
          ) : null}
          {trust.reason ? (
            <HudPanel>
              <div className="text-red-400">Misura non valida — {trust.reason}</div>
            </HudPanel>
          ) : null}
          <HudPanel>
            <div className="text-white/60">
              {phase === "orbita" ? (
                stores ? (
                  <>
                    <b className="text-white">Spazio</b> avvia la sequenza
                  </>
                ) : (
                  <>caricamento dati…</>
                )
              ) : phase === "navigabile" ? (
                <>
                  <b className="text-white">R</b> torna all&apos;orbita · mappa navigabile
                </>
              ) : (
                <>sequenza in corso…</>
              )}
            </div>
          </HudPanel>
        </div>
      </Hud>
    </main>
  );
}
