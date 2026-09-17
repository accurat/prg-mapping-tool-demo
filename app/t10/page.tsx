"use client";

import {
  AmbientLight,
  ArcLayer,
  ColumnLayer,
  DirectionalLight,
  LightingEffect,
  MapLibreOverlay,
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

  const arcs = useMemo(
    () => stores.map((s) => ({ store: s, hub: hubs[s.hub].position })),
    [stores, hubs],
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
          new ArcLayer<{ store: Store; hub: [number, number] }>({
            id: "rete",
            data: arcs,
            getSourcePosition: (d) => d.hub,
            getTargetPosition: (d) => {
              // L'arco cresce dall'hub verso il negozio, scaglionato per
              // distanza: la stella si apre invece di comparire tutta insieme.
              const local = Math.max(0, Math.min(1, (net - d.store.reach * 0.5) / 0.5));
              const eased = local * local * (3 - 2 * local);
              return [
                d.hub[0] + (d.store.position[0] - d.hub[0]) * eased,
                d.hub[1] + (d.store.position[1] - d.hub[1]) * eased,
              ] as [number, number];
            },
            getSourceColor: () => [255, 220, 150, 210],
            getTargetColor: (d) => valueColor(d.store.value, 220),
            getWidth: 8,
            widthUnits: "pixels",
            // Archi alti: l'arco deve staccarsi dal suolo e leggersi come un
            // collegamento, non come una linea disegnata sulla mappa. Il
            // limite superiore non e' estetico — oltre una certa quota la
            // geometria esce dal tronco di visuale della mappa e viene
            // troncata a meta' aria.
            getHeight: 0.75,
            updateTriggers: { getTargetPosition: net },
            ...under(labelId),
          }),
        );
      }

      overlay.setProps({
        layers: soloArchi ? layers.slice(1) : layers,
        effects: [LIGHT],
      });
    },
    [stores, arcs, labelId],
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

    // La discesa e' un movimento solo, ma in due tratti: il cambio di
    // proiezione avviene **nel mezzo**, non alla fine.
    //
    // Cambiandola all'arrivo la camera si riassesta in modo visibile, perche'
    // a quel punto l'inclinazione e' gia' a 55 gradi e le due proiezioni la
    // interpretano diversamente. A zoom 6 con inclinazione zero, invece, globo
    // e piano coincidono gia' e il passaggio non si vede.
    m.flyTo({
      center: TARGET,
      zoom: 6,
      pitch: 0,
      bearing: 0,
      duration: 3800,
      essential: true,
    });
    await pause(3850);

    m.setProjection({ type: "mercator" });

    // Secondo tratto: qui entra l'inclinazione, in proiezione piana.
    m.easeTo({
      center: TARGET,
      zoom: ARRIVAL_ZOOM,
      pitch: ARRIVAL_PITCH,
      duration: 2600,
      essential: true,
    });
    await pause(2700);

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
