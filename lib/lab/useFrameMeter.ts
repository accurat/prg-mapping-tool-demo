"use client";

import { useEffect, useRef, useState } from "react";

export type FrameStats = {
  /** Fotogrammi al secondo, mediana sulla finestra mobile. */
  median: number;
  /** Il peggior fotogramma della finestra mobile, espresso in fps. */
  min: number;
  /** Il peggior fotogramma dall'ultimo azzeramento. */
  worst: number;
  /** Durata del fotogramma mediano, in millisecondi. */
  medianMs: number;
  /** Fotogrammi campionati dall'ultimo azzeramento. */
  samples: number;
};

const EMPTY: FrameStats = {
  median: 0,
  min: 0,
  worst: 0,
  medianMs: 0,
  samples: 0,
};

/**
 * Misura la durata dei fotogrammi e ne riporta mediana e minimo.
 *
 * Due accorgimenti che servono a non falsare la misura:
 * - i campioni si accumulano in ref e lo stato React viene aggiornato al massimo
 *   quattro volte al secondo, altrimenti sarebbe il contatore stesso a costare;
 * - i primi fotogrammi dopo l'avvio o un azzeramento vengono scartati, perché
 *   comprendono compilazione di shader e allocazioni.
 */
export function useFrameMeter({
  windowSize = 120,
  warmupFrames = 20,
  flushIntervalMs = 250,
}: {
  windowSize?: number;
  warmupFrames?: number;
  flushIntervalMs?: number;
} = {}) {
  const [stats, setStats] = useState<FrameStats>(EMPTY);

  const durations = useRef<number[]>([]);
  const cursor = useRef(0);
  const filled = useRef(0);
  const seen = useRef(0);
  const worstMs = useRef(0);
  const resetToken = useRef(0);

  const reset = () => {
    resetToken.current += 1;
    durations.current = [];
    cursor.current = 0;
    filled.current = 0;
    seen.current = 0;
    worstMs.current = 0;
    setStats(EMPTY);
  };

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let lastFlush = last;

    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      seen.current += 1;

      if (seen.current > warmupFrames && dt > 0) {
        durations.current[cursor.current] = dt;
        cursor.current = (cursor.current + 1) % windowSize;
        filled.current = Math.min(filled.current + 1, windowSize);
        if (dt > worstMs.current) worstMs.current = dt;
      }

      if (now - lastFlush >= flushIntervalMs && filled.current > 0) {
        lastFlush = now;
        const sorted = durations.current.slice(0, filled.current).sort((a, b) => a - b);
        const medianMs = sorted[Math.floor(sorted.length / 2)];
        const slowestMs = sorted[sorted.length - 1];
        setStats({
          median: 1000 / medianMs,
          min: 1000 / slowestMs,
          worst: 1000 / worstMs.current,
          medianMs,
          samples: filled.current,
        });
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [windowSize, warmupFrames, flushIntervalMs]);

  return { stats, reset };
}
