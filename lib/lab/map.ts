"use client";

import type { MapHandle } from "@/components/lab/MapSurface";

/** Attende l'assestamento della mappa, con un limite. Vero se e' arrivato. */
export function settle(map: MapHandle, timeoutMs: number): Promise<boolean> {
  if (map.areTilesLoaded()) return Promise.resolve(true);
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      resolve(ok);
    };
    const timer = window.setTimeout(() => finish(false), timeoutMs);
    map.once("idle", () => finish(true));
  });
}

/**
 * Posiziona un layer deck.gl sotto un livello della mappa, in modalita'
 * interlacciata.
 *
 * `beforeId` viene letto a runtime dall'integrazione con MapLibre, ma non
 * compare nei tipi delle proprieta' dei layer: da qui il cast, confinato in
 * questo punto invece di essere ripetuto a ogni layer.
 */
export function under(layerId?: string): object {
  return layerId ? { beforeId: layerId } : {};
}

/** Attende N fotogrammi. */
function nextFrames(n: number): Promise<void> {
  return new Promise((resolve) => {
    let left = n;
    const step = () => (left-- <= 0 ? resolve() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  });
}

export type PrefetchReport = {
  steps: number;
  /** Passi in cui l'assestamento non e' arrivato entro il limite. */
  timedOut: number;
  durationMs: number;
};

/**
 * Precarica il corridoio della discesa percorrendolo a salti prima del volo.
 *
 * Perche' cosi' e non calcolando gli indirizzi delle tessere: spostando la
 * camera e' MapLibre stessa a decidere quali tessere servono per quella
 * inquadratura, con la sua proiezione, la sua inclinazione e il suo margine.
 * Qualsiasi calcolo nostro sarebbe una riapprossimazione di quella logica,
 * destinata a divergere.
 *
 * Due accorgimenti:
 *
 * - **L'inclinazione viene maggiorata** rispetto a quella che avra' il volo.
 *   Piu' inclinazione significa piu' territorio inquadrato, quindi le tessere
 *   caricate sono un sovrainsieme di quelle che serviranno davvero.
 * - **Ogni passo ha un limite di tempo.** Un precaricamento che non finisce e'
 *   peggio di uno incompleto: in sala bloccherebbe l'apertura.
 *
 * Perche' funzioni, la cache della mappa deve poter trattenere l'intero
 * corridoio: vedi `maxTileCacheZoomLevels` in MapSurface. Senza quello le
 * tessere dei primi passi vengono sfrattate prima che il volo le raggiunga, e
 * il precaricamento non serve a niente.
 */
export async function prefetchDescent(
  map: MapHandle,
  {
    center,
    fromZoom,
    toZoom,
    toPitch,
    tappe = [],
    steps = 8,
    pitchMargin = 10,
    stepTimeoutMs = 4000,
  }: {
    center: [number, number];
    fromZoom: number;
    toZoom: number;
    toPitch: number;
    /**
     * Inquadrature fuori dal corridoio che il volo attraversera' comunque.
     *
     * Il corridoio e' una retta fra due zoom sullo stesso centro: una sosta
     * intermedia su un altro centro non ci cade dentro, e quelle tessere
     * arriverebbero durante il volo invece che prima. Si percorrono anche
     * quelle, con lo stesso metodo.
     */
    tappe?: { center: [number, number]; zoom: number; pitch: number }[];
    steps?: number;
    pitchMargin?: number;
    stepTimeoutMs?: number;
  },
): Promise<PrefetchReport> {
  const started = performance.now();
  let timedOut = 0;

  for (const tappa of tappe) {
    map.jumpTo({ ...tappa, bearing: 0 });
    await nextFrames(2);
    if (!(await settle(map, stepTimeoutMs))) timedOut += 1;
  }

  for (let i = 0; i < steps; i++) {
    const t = steps === 1 ? 1 : i / (steps - 1);
    const zoom = fromZoom + (toZoom - fromZoom) * t;
    const pitch = Math.min(85, toPitch * t + pitchMargin);

    map.jumpTo({ center, zoom, pitch, bearing: 0 });

    // Due fotogrammi prima di interrogare lo stato: subito dopo un salto di
    // camera la mappa risponde ancora sulla situazione precedente, e si
    // otterrebbe un precaricamento che dichiara di aver finito senza aver
    // atteso nulla.
    await nextFrames(2);

    const ok = await settle(map, stepTimeoutMs);
    if (!ok) timedOut += 1;
  }

  map.jumpTo({ center, zoom: fromZoom, pitch: 0, bearing: 0 });
  await nextFrames(2);
  await settle(map, stepTimeoutMs);

  return { steps: steps + tappe.length, timedOut, durationMs: performance.now() - started };
}
