"use client";

export type Sample = {
  /** Fotogrammi al secondo, mediana. */
  median: number;
  /** Il peggior fotogramma del campione, espresso in fotogrammi al secondo. */
  min: number;
  /** Il 95esimo percentile dei tempi di fotogramma, in millisecondi. Piu'
   *  robusto del peggiore, che spesso e' un singolo intoppo isolato. */
  p95Ms: number;
  /** Durata del fotogramma mediano, in millisecondi. Non dipende dal limite del monitor. */
  medianMs: number;
  /** Durata del peggior fotogramma, in millisecondi. */
  worstMs: number;
  frames: number;
  /** Quota di fotogrammi in cui qualcosa era ancora in caricamento. */
  unsettledShare: number;
};

/**
 * Misura per una durata fissa e restituisce le statistiche del periodo.
 *
 * Volutamente separata dal contatore a schermo: qui serve una misura chiusa,
 * ripetibile e confrontabile, senza stato React di mezzo.
 *
 * I primi fotogrammi vengono scartati perche' comprendono compilazione di
 * shader, allocazioni e il primo disegno della scena.
 */
export function measure(durationMs: number, isSettled?: () => boolean): Promise<Sample> {
  return new Promise((resolve) => {
    const warmupMs = 300;
    const durations: number[] = [];
    let unsettled = 0;
    let last = performance.now();
    const start = last;

    const tick = (now: number) => {
      const dt = now - last;
      last = now;

      if (now - start > warmupMs && dt > 0) {
        durations.push(dt);
        if (isSettled && !isSettled()) unsettled += 1;
      }

      if (now - start >= durationMs + warmupMs) {
        if (durations.length === 0) {
          resolve({ median: 0, min: 0, p95Ms: 0, medianMs: 0, worstMs: 0, frames: 0, unsettledShare: 0 });
          return;
        }
        const sorted = [...durations].sort((a, b) => a - b);
        const medianMs = sorted[Math.floor(sorted.length / 2)];
        const worstMs = sorted[sorted.length - 1];
        resolve({
          median: 1000 / medianMs,
          min: 1000 / worstMs,
          p95Ms: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
          medianMs,
          worstMs,
          frames: durations.length,
          unsettledShare: unsettled / durations.length,
        });
        return;
      }

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  });
}

export const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
