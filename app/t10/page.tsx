"use client";

import {
  AmbientLight,
  ColumnLayer,
  DirectionalLight,
  LightingEffect,
  MapLibreOverlay,
  TripsLayer,
} from "deck.gl";
import type { Layer } from "deck.gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Hud, HudPanel, Row, fpsTone } from "@/components/lab/Hud";
import { MapSurface, type MapHandle } from "@/components/lab/MapSurface";
import { Stage } from "@/components/lab/Stage";
import { prefetchDescent, settle, under } from "@/lib/lab/map";
import { makeStoreNetwork, type Store } from "@/lib/lab/network";
import { useFrameMeter } from "@/lib/lab/useFrameMeter";
import { useRenderTrust } from "@/lib/lab/useRenderTrust";

const WIDTH = 5760;
const HEIGHT = 1080;
const TARGET: [number, number] = [-94.5786, 39.0997];
const STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

const START_ZOOM = 0.4;
const ARRIVAL_ZOOM = 8.6;
const ARRIVAL_PITCH = 55;

/** Altezza massima delle colonne quando mostrano il dato. */
const DATA_HEIGHT_M = 26000;
/** Altezza uniforme quando diventano semplici segnaposto. */
const MARKER_HEIGHT_M = 3000;

type Phase =
  | "attesa"
  | "preparazione"
  | "discesa"
  | "colonne"
  | "lettura"
  | "appiattimento"
  | "archi"
  | "finito";

const PHASE_LABEL: Record<Phase, string> = {
  attesa: "in attesa",
  preparazione: "precaricamento del corridoio",
  discesa: "discesa dal globo",
  colonne: "il potenziale emerge",
  lettura: "lettura",
  appiattimento: "da dato a luogo",
  archi: "la rete si accende",
  finito: "fine",
};

/**
 * Illuminazione della scena.
 *
 * Le ombre si possono tenere **solo finche' non ci sono archi**: con il
 * passaggio delle ombre attivo l'ArcLayer non viene disegnato affatto. Non e'
 * una questione di resa, spariscono. Per fortuna i due momenti non si
 * sovrappongono: quando la rete si accende i segnaposto sono gia' piatti, e
 * un'ombra su una piastrella non aggiunge niente.
 */
function makeLighting(shadows: boolean) {
  return new LightingEffect({
    ambient: new AmbientLight({ color: [255, 255, 255], intensity: 1.0 }),
    sun: new DirectionalLight({
      color: [255, 255, 255],
      intensity: 2.2,
      direction: [-1, -2.4, -1.2],
      _shadow: shadows,
    }),
  });
}

/**
 * Un'unica illuminazione per tutta la sequenza, **senza ombre**.
 *
 * Due vincoli, scoperti solo qui:
 *
 * - con il passaggio delle ombre attivo l'ArcLayer non viene disegnato
 *   affatto, quindi in una scena che contiene archi le ombre non si possono
 *   tenere;
 * - **cambiare illuminazione a meta' sequenza non e' una via d'uscita**:
 *   sostituire l'effetto mentre la scena e' in corso fa smettere deck.gl di
 *   disegnare qualsiasi cosa. Va scelta una volta e lasciata stare, come
 *   qualsiasi altro oggetto di deck.gl che non si ricrea a ogni fotogramma.
 */
const LIGHT = makeLighting(false);

/**
 * Colore caldo-freddo: a dodici metri la tinta e' l'unica cosa che trasmette
 * differenze, la luminosita' no (vedi T9). Quindi il valore sta nella tinta.
 */
function valueColor(t: number, alpha = 235): [number, number, number, number] {
  return [40 + t * 215, 70 + t * 95, 195 - t * 150, alpha];
}

export default function T10Page() {
  const [map, setMap] = useState<MapHandle | null>(null);
  const [phase, setPhase] = useState<Phase>("attesa");
  const [labelId, setLabelId] = useState<string | undefined>();
  const [prefetchMs, setPrefetchMs] = useState<number | null>(null);

  const overlayRef = useRef<MapLibreOverlay | null>(null);
  const started = useRef(false);

  const { stats } = useFrameMeter();
  const trust = useRenderTrust(stats.medianMs);

  const { hubs, stores } = useMemo(() => makeStoreNetwork({ center: TARGET }), []);

  /**
   * I collegamenti come percorsi campionati, non come archi.
   *
   * Un arco e' una primitiva unica: si puo' far comparire o allungare, non
   * disegnare poco per volta. Allungarlo significa cambiargli la forma mentre
   * appare, che e' proprio l'effetto da evitare. Un percorso con dei tempi si
   * traccia invece lungo la sua traiettoria definitiva, che non cambia mai.
   */
  const trips = useMemo(() => {
    const SAMPLES = 28;
    const SPAN = 100;
    return stores.map((store) => {
      const from = hubs[store.hub].position;
      const to = store.position;
      const path: [number, number, number][] = [];
      const timestamps: number[] = [];
      // Partenze scaglionate per distanza: ogni stella si apre dal centro.
      const offset = store.reach * 90;
      for (let i = 0; i < SAMPLES; i++) {
        const t = i / (SAMPLES - 1);
        path.push([
          from[0] + (to[0] - from[0]) * t,
          from[1] + (to[1] - from[1]) * t,
          Math.sin(t * Math.PI) * 34000 * (0.5 + store.value * 0.5),
        ]);
        timestamps.push(offset + t * SPAN);
      }
      return { path, timestamps, value: store.value };
    });
  }, [stores, hubs]);

  /** Istante oltre il quale ogni percorso e' completo. */
  const tripsEnd = useMemo(
    () => Math.max(...trips.map((t) => t.timestamps[t.timestamps.length - 1])) + 1,
    [trips],
  );

  const handleReady = useCallback((m: MapHandle) => {
    m.jumpTo({ center: TARGET, zoom: START_ZOOM, pitch: 0, bearing: 0 });
    setLabelId(m.getStyle().layers.find((l) => l.type === "symbol")?.id);
    setMap(m);
  }, []);

  useEffect(() => {
    if (!map) return;
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

  /**
   * Disegna la scena per un dato istante della sequenza.
   *
   * `rise` 0..1  quanto sono emerse le colonne
   * `flat` 0..1  quanto sono state appiattite a segnaposto
   * `net`  0..1  quanto si e' estesa la rete
   */
  const draw = useCallback(
    (rise: number, flat: number, net: number) => {
      const overlay = overlayRef.current;
      if (!overlay) return;

      const soloArchi =
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("solo") === "archi";

      const layers: Layer[] = [];

      // Durante la discesa i negozi non ci sono ancora: altrimenti si vedrebbe
      // una macchia colorata sul territorio prima che la scena cominci.
      if (rise > 0) layers.push(
        new ColumnLayer<Store>({
          id: "negozi",
          data: stores,
          diskResolution: 6,
          radius: 2600,
          extruded: true,
          getPosition: (d) => d.position,
          getElevation: (d) => {
            // Comparsa scaglionata: i negozi vicini al proprio hub salgono
            // per primi, cosi' ogni stella si apre dal centro verso fuori.
            const local = Math.max(0, Math.min(1, (rise - d.reach * 0.45) / 0.55));
            const dataHeight = d.value * DATA_HEIGHT_M * local;
            return dataHeight * (1 - flat) + MARKER_HEIGHT_M * flat * local;
          },
          // Il colore resta quello del valore anche da appiattite: cambia
          // l'altezza, non il significato. La cella continua a dire quanto
          // vale, e a dodici metri e' la tinta a trasmetterlo (vedi T9).
          getFillColor: (d) => valueColor(d.value),
          updateTriggers: { getElevation: [rise, flat] },
          ...under(labelId),
        }),
      );

      if (net > 0) {
        layers.push(
          new TripsLayer<{ path: [number, number, number][]; timestamps: number[]; value: number }>({
            id: "rete",
            data: trips,
            getPath: (d) => d.path,
            getTimestamps: (d) => d.timestamps,
            getColor: (d) => {
              const c = valueColor(d.value);
              return [c[0], c[1], c[2]];
            },
            widthUnits: "pixels",
            getWidth: 6,
            // La scia non svanisce mai: il percorso, una volta tracciato,
            // resta. Serve un disegno progressivo, non una cometa.
            trailLength: tripsEnd * 2,
            currentTime: net * tripsEnd,
            ...under(labelId),
          }),
        );
      }

      overlay.setProps({
        layers: soloArchi ? layers.slice(1) : layers,
        effects: [LIGHT],
      });
    },
    [stores, trips, tripsEnd, labelId],
  );

  /** Anima un valore da 0 a 1 nel tempo dato, con partenza e arrivo morbidi. */
  const animate = useCallback((ms: number, onFrame: (t: number) => void) => {
    return new Promise<void>((resolve) => {
      const start = performance.now();
      const step = (now: number) => {
        const raw = Math.min(1, (now - start) / ms);
        onFrame(raw * raw * (3 - 2 * raw));
        if (raw >= 1) return resolve();
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }, []);

  const run = useCallback(async () => {
    const m = map;
    if (!m) return;

    const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

    setPhase("preparazione");
    m.jumpTo({ center: TARGET, zoom: START_ZOOM, pitch: 0, bearing: 0 });
    draw(0, 0, 0);
    const report = await prefetchDescent(m, {
      center: TARGET,
      fromZoom: START_ZOOM,
      toZoom: ARRIVAL_ZOOM,
      toPitch: ARRIVAL_PITCH,
    });
    setPrefetchMs(report.durationMs);
    await settle(m, 4000);

    setPhase("discesa");

    // Un volo solo, dal globo fino a destinazione: spezzarlo in due tratti per
    // cambiare proiezione a meta' rende il passaggio piu' evidente, non meno,
    // perche' a zoom intermedi la curvatura della sfera si vede ancora.
    m.flyTo({
      center: TARGET,
      zoom: ARRIVAL_ZOOM,
      pitch: ARRIVAL_PITCH,
      duration: 6000,
      essential: true,
    });
    await pause(6200);

    // Nessun cambio di proiezione: si resta in globo per tutta la sequenza.
    //
    // Su un'inquadratura larga 5760 pixel il campo visivo orizzontale e'
    // enorme e la curvatura resta percepibile anche a zoom alti: non esiste un
    // momento in cui il passaggio da sfera a piano non si veda. L'unico modo
    // per non farlo vedere e' non farlo.
    //
    // Regge perche' la rete e' disegnata con percorsi e non con archi:
    // l'ArcLayer sotto vista sferica non viene disegnato, i percorsi si'.

    setPhase("colonne");
    await animate(2600, (t) => draw(t, 0, 0));

    setPhase("lettura");
    await pause(2200);

    setPhase("appiattimento");
    await animate(1600, (t) => draw(1, t, 0));

    await pause(600);
    setPhase("archi");
    await animate(2600, (t) => draw(1, 1, t));

    setPhase("finito");
  }, [map, draw, animate]);

  useEffect(() => {
    if (started.current || !map) return;
    started.current = true;
    void run();
  }, [map, run]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "r" || e.key === "R") void run();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run]);

  return (
    <main className="h-screen w-screen overflow-hidden bg-black">
      <Stage width={WIDTH} height={HEIGHT}>
        <MapSurface
          width={WIDTH}
          height={HEIGHT}
          styleUrl={STYLE}
          projection="globe"
          onReady={handleReady}
        />
      </Stage>

      <Hud>
        <div className="flex items-start gap-3">
          <HudPanel title="T10 — sequenza completa">
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

          <HudPanel title="scena">
            <Row label="negozi" value={stores.length} />
            <Row label="hub" value={hubs.length} />
            <Row
              label="precaricamento"
              value={prefetchMs === null ? "—" : `${(prefetchMs / 1000).toFixed(1)} s`}
            />
          </HudPanel>
        </div>

        <div className="flex flex-col gap-2">
          {trust.reason ? (
            <HudPanel>
              <div className="text-red-400">Misura non valida — {trust.reason}</div>
            </HudPanel>
          ) : null}
          <HudPanel>
            <div className="text-white/60">
              <b className="text-white">R</b> ripeti la sequenza
            </div>
          </HudPanel>
        </div>
      </Hud>
    </main>
  );
}
