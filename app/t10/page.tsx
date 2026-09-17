"use client";

import {
  AmbientLight,
  ColumnLayer,
  DirectionalLight,
  LightingEffect,
  MapLibreOverlay,
  ScatterplotLayer,
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

/** Secondi che un carico impiega a percorrere il collegamento, dall'hub al negozio. */
const PULSE_TRAVEL_S = 2.8;
/** Carichi contemporanei su un collegamento: da uno a cinque, secondo il volume. */
const pulseCount = (volume: number) => 1 + Math.round(volume * 4);

type Phase =
  | "attesa"
  | "preparazione"
  | "discesa"
  | "colonne"
  | "lettura"
  | "appiattimento"
  | "archi"
  | "fuoco"
  | "flusso"
  | "finito";

const PHASE_LABEL: Record<Phase, string> = {
  attesa: "in attesa",
  preparazione: "precaricamento del corridoio",
  discesa: "discesa dal globo",
  colonne: "il potenziale emerge",
  lettura: "lettura",
  appiattimento: "da dato a luogo",
  archi: "la rete si accende",
  fuoco: "si stringe su un'area",
  flusso: "la merce scorre",
  finito: "fine",
};

/**
 * Profilo di altezza dell'arco.
 *
 * La partenza e l'arrivo devono restare ripidi: l'arco si stacca da terra
 * deciso, ed e' giusto cosi'. Quello che va addolcito e' **solo il vertice**,
 * che con un profilo sinusoidale arriva stretto e sembra una punta.
 *
 * Questa e' una superellisse. A esponente 2 e' un arco di cerchio: fianchi
 * ripidissimi e sommita' rotonda, che e' esattamente il compromesso cercato.
 * Salendo di esponente la cima si allarga ancora, ma sopra il 2,5 diventa un
 * tavolo con gli spigoli smussati invece di un arco.
 */
function archProfile(t: number): number {
  const EXPONENT = 2.05;
  const x = Math.abs(t * 2 - 1);
  return Math.pow(Math.max(0, 1 - Math.pow(x, EXPONENT)), 1 / EXPONENT);
}

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
  const flowRaf = useRef(0);

  useEffect(() => () => cancelAnimationFrame(flowRaf.current), []);

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
    const SAMPLES = 44;
    const SPAN = 100;
    return stores.map((store) => {
      const from = hubs[store.hub].position;
      const to = store.position;

      // L'altezza dell'arco e' una **proporzione della sua lunghezza**, non un
      // valore fisso.
      //
      // Con un'altezza uguale per tutti, un negozio a pochi chilometri dal
      // proprio hub riceveva un arco alto quanto quelli lunghi: una guglia
      // quasi verticale. Legandola alla distanza, tutti i collegamenti hanno la
      // stessa proporzione e la stessa morbidezza, e i piu' lunghi mantengono
      // la quota di prima.
      const metersPerDegLat = 111_320;
      const dx =
        (to[0] - from[0]) * metersPerDegLat * Math.cos((from[1] * Math.PI) / 180);
      const dy = (to[1] - from[1]) * metersPerDegLat;
      const length = Math.hypot(dx, dy);
      const apex = length * 0.45 * (0.65 + store.value * 0.35);
      const path: [number, number, number][] = [];
      const timestamps: number[] = [];
      // Partenze scaglionate per distanza: ogni stella si apre dal centro.
      const offset = store.reach * 90;
      for (let i = 0; i < SAMPLES; i++) {
        const t = i / (SAMPLES - 1);
        path.push([
          from[0] + (to[0] - from[0]) * t,
          from[1] + (to[1] - from[1]) * t,
          archProfile(t) * apex,
        ]);
        timestamps.push(offset + t * SPAN);
      }
      return { path, timestamps, value: store.value, hub: store.hub, volume: store.volume };
    });
  }, [stores, hubs]);

  /**
   * L'area su cui ci si stringe alla fine: l'hub con il potenziale medio piu'
   * alto fra i propri negozi. Scelta dai dati, non fissata a mano, cosi' la
   * sequenza indica sempre l'area che merita davvero attenzione.
   */
  const focusHub = useMemo(() => {
    const totals = hubs.map((h) => {
      const mine = stores.filter((s) => s.hub === h.index);
      return mine.reduce((sum, s) => sum + s.value, 0) / Math.max(1, mine.length);
    });
    return totals.indexOf(Math.max(...totals));
  }, [hubs, stores]);

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
   * `rise`  0..1  quanto sono emerse le colonne
   * `flat`  0..1  quanto sono state appiattite a segnaposto
   * `net`   0..1  quanto si e' estesa la rete
   * `focus` 0..1  quanto e' svanito tutto cio' che non e' l'area scelta
   * `flow`  secondi trascorsi dall'inizio del flusso, 0 se non e' partito
   */
  const draw = useCallback(
    (rise: number, flat: number, net: number, focus = 0, flow = 0) => {
      // Quanto resta visibile di un dato hub: l'area scelta resta intera,
      // le altre si dissolvono.
      const keep = (hub: number) => (hub === focusHub ? 1 : 1 - focus);

      /** Posizione dei carichi lungo i collegamenti, a un dato istante. */
      const flowPulses = (seconds: number) => {
        if (seconds <= 0) return [] as { position: [number, number, number]; value: number }[];
        const out: { position: [number, number, number]; value: number }[] = [];
        for (const trip of trips) {
          if (trip.hub !== focusHub) continue;
          const n = pulseCount(trip.volume);
          const last = trip.path.length - 1;
          for (let k = 0; k < n; k++) {
            const phase = ((seconds / PULSE_TRAVEL_S + k / n) % 1 + 1) % 1;
            const at = phase * last;
            const i = Math.min(last - 1, Math.floor(at));
            const f = at - i;
            const a = trip.path[i];
            const b = trip.path[i + 1];
            out.push({
              position: [
                a[0] + (b[0] - a[0]) * f,
                a[1] + (b[1] - a[1]) * f,
                a[2] + (b[2] - a[2]) * f,
              ],
              value: trip.value,
            });
          }
        }
        return out;
      };

      /**
       * Quanto e' emerso un singolo negozio, 0..1.
       *
       * Scaglionata per distanza dal proprio hub: quelli vicini salgono per
       * primi, cosi' ogni stella si apre dal centro verso fuori invece che
       * tutta insieme.
       */
      const localRise = (d: Store) =>
        Math.max(0, Math.min(1, (rise - d.reach * 0.45) / 0.55));
      const overlay = overlayRef.current;
      if (!overlay) return;

      const soloArchi =
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("solo") === "archi";

      // I due strati esistono **sempre**, fin dal precaricamento, anche quando
      // non si vedono: a `rise` zero le colonne sono trasparenti e alte zero, a
      // `net` zero nessun percorso e' ancora stato tracciato.
      //
      // Serve perche' la prima volta che la scheda video disegna un tipo di
      // elemento deve preparare i programmi di disegno e caricare i dati, e quel
      // lavoro avviene dentro un solo fotogramma, che dura il doppio degli
      // altri. Creandoli qui, quel fotogramma cade durante il precaricamento —
      // quando sullo schermo non c'e' niente — invece che nell'istante in cui il
      // rilievo emerge o la rete si accende, cioe' i due momenti in cui la sala
      // guarda con piu' attenzione.
      const layers: Layer[] = [
        new ColumnLayer<Store>({
          id: "negozi",
          data: stores,
          diskResolution: 6,
          radius: 2600,
          extruded: true,
          getPosition: (d) => d.position,
          getElevation: (d) => {
            const local = localRise(d);
            const dataHeight = d.value * DATA_HEIGHT_M * local;
            const height = dataHeight * (1 - flat) + MARKER_HEIGHT_M * flat * local;
            // Svanendo rientrano anche nel terreno, invece di restare in piedi
            // e sbiadire: un segnaposto trasparente ma alto resta un ingombro.
            return height * keep(d.hub);
          },
          // Il colore resta quello del valore anche da appiattite: cambia
          // l'altezza, non il significato. La cella continua a dire quanto
          // vale, e a dodici metri e' la tinta a trasmetterlo (vedi T9).
          //
          // L'opacita' segue la stessa comparsa scaglionata dell'altezza:
          // senza, all'inizio della fase tutti gli esagoni comparirebbero
          // insieme a colore pieno e altezza zero — una macchia che si
          // accende di scatto — e solo dopo si alzerebbero.
          getFillColor: (d) => {
            const c = valueColor(d.value);
            const l = localRise(d);
            return [c[0], c[1], c[2], c[3] * (l * l * (3 - 2 * l)) * keep(d.hub)];
          },
          updateTriggers: {
            getElevation: [rise, flat, focus],
            getFillColor: [rise, focus],
          },
          ...under(labelId),
        }),

        new TripsLayer<{
          path: [number, number, number][];
          timestamps: number[];
          value: number;
          hub: number;
        }>({
          id: "rete",
          data: trips,
          getPath: (d) => d.path,
          getTimestamps: (d) => d.timestamps,
          getColor: (d) => {
            const c = valueColor(d.value);
            return [c[0], c[1], c[2], 255 * keep(d.hub)];
          },
          widthUnits: "pixels",
          getWidth: 6,
          // La scia non svanisce mai: il percorso, una volta tracciato, resta.
          // Serve un disegno progressivo, non una cometa.
          trailLength: tripsEnd * 2,
          currentTime: net * tripsEnd,
          updateTriggers: { getColor: focus },
          ...under(labelId),
        }),

        /**
         * I carichi in viaggio lungo i collegamenti.
         *
         * Quanti ne corrono insieme dipende dal volume scambiato: un
         * collegamento molto trafficato mostra un flusso continuo, uno con poca
         * merce un carico ogni tanto. La velocita' e' la stessa per tutti —
         * cambia la frequenza, non la fretta.
         *
         * Le posizioni si campionano sulla stessa curva gia' calcolata per i
         * collegamenti, cosi' i carichi corrono esattamente sull'arco disegnato
         * invece che su una traiettoria simile.
         */
        new ScatterplotLayer<{ position: [number, number, number]; value: number }>({
          id: "carichi",
          data: flowPulses(flow),
          radiusUnits: "pixels",
          getRadius: 5,
          billboard: true,
          getPosition: (d) => d.position,
          // Colore unico e caldo: il carico non deve dire quanto vale il
          // negozio — quello lo dicono gia' la cella e il collegamento — deve
          // solo farsi vedere mentre si muove.
          getFillColor: () => [255, 240, 210, flow > 0 ? 255 : 0],
          updateTriggers: { getFillColor: flow > 0 },
        }),
      ];

      overlay.setProps({
        layers: soloArchi ? layers.slice(1) : layers,
        effects: [LIGHT],
      });
    },
    [stores, trips, tripsEnd, focusHub, labelId],
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

    await pause(1800);

    // Si stringe su una sola area. Il movimento della camera e la dissolvenza
    // di tutto il resto avvengono **insieme**: se il muro si svuotasse prima,
    // la sala vedrebbe sparire dei dati e poi un viaggio; cosi' vede una cosa
    // sola, l'attenzione che si restringe.
    setPhase("fuoco");
    m.easeTo({
      center: hubs[focusHub].position,
      zoom: 9.6,
      // Perpendicolare al suolo: finito il racconto in rilievo, si torna a
      // guardare la geografia dall'alto.
      pitch: 0,
      bearing: 0,
      duration: 3000,
      essential: true,
    });
    await animate(3000, (t) => draw(1, 1, 1, t));

    // Il flusso non ha una fine: da qui in poi la scena resta viva, con la
    // merce che continua a viaggiare finche' qualcuno non interviene.
    setPhase("flusso");
    const flowStart = performance.now();
    const loop = () => {
      draw(1, 1, 1, 1, (performance.now() - flowStart) / 1000);
      flowRaf.current = requestAnimationFrame(loop);
    };
    flowRaf.current = requestAnimationFrame(loop);
  }, [map, draw, animate, hubs, focusHub]);

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
