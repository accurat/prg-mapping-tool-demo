"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Hud, HudPanel, Row, fpsTone } from "@/components/lab/Hud";
import { MapSurface, type MapHandle } from "@/components/lab/MapSurface";
import { Stage } from "@/components/lab/Stage";
import { EtichetteHub } from "@/components/scena/EtichetteHub";
import { makeStoreNetwork } from "@/lib/lab/network";
import { useFrameMeter } from "@/lib/lab/useFrameMeter";
import { useRenderTrust } from "@/lib/lab/useRenderTrust";
import type { DatiScena } from "@/lib/scena/dati";
import { START_ZOOM, nomeFase, useSequenza, type Inclinazione } from "@/lib/scena/sequenza";

/**
 * T10 — la sequenza completa, su dati sintetici.
 *
 * Resta com'era: e' la misura di riferimento, e cambiarne i dati vorrebbe dire
 * perdere il termine di paragone di tutto quello che e' venuto dopo. La
 * sequenza vive ora in `lib/scena/sequenza.ts`, condivisa con T12, che la
 * ripete identica con i pannelli sopra: e' l'unico modo perche' il confronto
 * fra le due pagine misuri i pannelli e non due programmi diversi.
 */

const WIDTH = 5760;
const HEIGHT = 1080;
const TARGET: [number, number] = [-94.5786, 39.0997];
const STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

export default function T10Page() {
  const [map, setMap] = useState<MapHandle | null>(null);
  const [labelId, setLabelId] = useState<string | undefined>();
  const [inclinazione, setInclinazione] = useState<Inclinazione>("discesa");

  const { stats } = useFrameMeter();
  const trust = useRenderTrust(stats.medianMs);

  const dati = useMemo<DatiScena>(() => {
    const { hubs, stores } = makeStoreNetwork({ center: TARGET });
    const medie = hubs.map((h) => {
      const suoi = stores.filter((s) => s.hub === h.index);
      return suoi.reduce((somma, s) => somma + s.value, 0) / Math.max(1, suoi.length);
    });
    const fuoco = medie.indexOf(Math.max(...medie));
    return {
      hubs,
      // Dati finti, nomi finti: inventare nomi di citta' vere su posizioni
      // inventate renderebbe la prova piu' convincente di quanto sia.
      nomiHub: hubs.map((_, i) => `Centro ${i + 1}`),
      stores,
      indiciStore: new Int32Array(0),
      indiciPerHub: [],
      centro: TARGET,
      zoomArrivo: 8.6,
      pitchArrivo: 55,
      fuoco,
      centroFuoco: hubs[fuoco].position,
      zoomFuoco: 9.6,
      proporzioneArco: 0.45,
      verticeMassimo: 80_000,
      raggioStore: 2600,
      raggioHub: 6000,
      ingrandimentoHub: 4.5,
      altezzaDato: 26000,
      altezzaSegnaposto: 3000,
    };
  }, []);

  const handleReady = useCallback((m: MapHandle) => {
    m.jumpTo({ center: TARGET, zoom: START_ZOOM, pitch: 0, bearing: 0 });
    setLabelId(m.getStyle().layers.find((l) => l.type === "symbol")?.id);
    setMap(m);
  }, []);

  const { fase, prefetchMs, esegui, etichetteHub, opacitaEtichette } = useSequenza({
    map,
    labelId,
    dati,
    inclinazione,
  });

  useEffect(() => {
    const suTasto = (e: KeyboardEvent) => {
      if (e.key === "i" || e.key === "I") {
        setInclinazione((v) => (v === "discesa" ? "fuoco" : "discesa"));
      }
    };
    window.addEventListener("keydown", suTasto);
    return () => window.removeEventListener("keydown", suTasto);
  }, []);

  // Cambiare l'ordine a meta' sequenza non direbbe niente: i due ordini si
  // confrontano solo dall'inizio, quindi l'interruttore fa ripartire il volo.
  const primoGiro = useRef(true);
  useEffect(() => {
    if (primoGiro.current) {
      primoGiro.current = false;
      return;
    }
    void esegui();
  }, [inclinazione, esegui]);

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
          <EtichetteHub
            map={map}
            etichette={etichetteHub}
            opacita={opacitaEtichette}
            larghezza={WIDTH}
            altezza={HEIGHT}
          />
        </div>
      </Stage>

      <Hud>
        <div className="flex items-start gap-3">
          <HudPanel title="T10 — sequenza completa">
            <Row label="momento" value={nomeFase(fase, inclinazione)} tone="good" />
            <Row
              label="inclinazione"
              value={inclinazione === "discesa" ? "nella discesa" : "nella stretta"}
              tone="warn"
            />
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
            <Row label="negozi" value={dati.stores.length} />
            <Row label="hub" value={dati.hubs.length} />
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
              <b className="text-white">R</b> ripeti la sequenza · <b className="text-white">I</b>{" "}
              sposta l&apos;inclinazione (discesa ↔ stretta)
            </div>
          </HudPanel>
        </div>
      </Hud>
    </main>
  );
}
