/**
 * Le misure del muro.
 *
 * Non sono scelte di gusto: discendono da T9, cioe' da quanto e' grande un
 * pixel su una superficie larga sei metri guardata da dodici. La conversione
 * sta in `lib/lab/wall.ts` — un pixel vale circa un millimetro — e da li'
 * discende tutto il resto.
 *
 * **Nessun testo sotto i 36 pixel.** Sotto quella misura una lettera occupa
 * meno di dieci minuti d'arco e la sala non la legge: non la legge male, non la
 * legge.
 */

import { legibility } from "@/lib/lab/wall";

export const TIPI = {
  /** Etichette e unita'. E' il minimo assoluto, non una scelta di stile. */
  minimo: 36,
  /** Testo corrente dei pannelli. */
  corrente: 48,
  /** Numeri che devono leggersi prima del testo che li accompagna. */
  numero: 72,
  /** Titoli e nomi di luogo. */
  titolo: 96,
  /** Il numero che e' la ragione della storia: il primo che la sala legge. */
  eroe: 150,
} as const;

export const COLORI = {
  fondo: "rgba(8, 10, 14, 0.82)",
  bordo: "rgba(255, 255, 255, 0.14)",
  testo: "#ffffff",
  smorzato: "rgba(255, 255, 255, 0.45)",
  accento: "#ffb35c",
  riferimento: "rgba(255, 255, 255, 0.35)",
} as const;

/** Margini delle zone, in pixel di muro. */
export const SPAZI = {
  bordoSchermo: 64,
  interno: 40,
  riga: 16,
} as const;

/**
 * Verifica che una misura sia leggibile in sala.
 *
 * Esiste per essere chiamata dalla verifica, non dal disegno: serve a poter
 * dire «nessun testo di questa pagina sta sotto la soglia» con un numero
 * invece che con un'impressione.
 */
export function controllaTesto(px: number) {
  const { arcmin, mm, verdict } = legibility(px);
  return { px, mm, arcmin, verdict, passa: px >= TIPI.minimo };
}
