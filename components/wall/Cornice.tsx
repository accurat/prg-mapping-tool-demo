"use client";

import type { CSSProperties, ReactNode } from "react";
import { COLORI, SPAZI, TIPI } from "./tokens";

/**
 * Le zone permanenti del muro (documento dei layout, M0).
 *
 * Tre regole, tutte conseguenza di misure gia' fatte e non di gusto:
 *
 * - **la cornice vive dentro lo Stage**, cioe' nello spazio del muro. Il
 *   pannello di diagnosi e' `fixed` e vive nello spazio della finestra: li'
 *   «36 pixel» sarebbero 36 pixel di finestra, cioe' un decimo di quello che
 *   serve. Per questo la cornice e' scritta da capo invece che riusata;
 * - **niente sfocature di fondo.** Un `backdrop-filter` sopra un canvas da
 *   5760x1080 e' una rilettura di mezzo schermo a ogni fotogramma, ed e' il
 *   genere di costo che non si vede sul portatile e si vede in sala;
 * - **i pannelli esistono sempre**, anche quando non si vedono: entrano ed
 *   escono per opacita'. E' la stessa lezione degli strati creati durante il
 *   precaricamento — il primo disegno costa, e quel costo non deve cadere
 *   nell'istante in cui la sala guarda.
 *
 * La zona centrale non e' un contenitore: e' lo spazio che i pannelli non
 * possono occupare. E' dove si guarda.
 */

export const LARGHEZZA_SCHERMO = 1920;
const TRANSIZIONE = "opacity 700ms cubic-bezier(0.4, 0, 0.2, 1)";

export type Zone = {
  alta?: ReactNode;
  sinistra?: ReactNode;
  destra?: ReactNode;
  striscia?: ReactNode;
};

export type Visibili = {
  alta?: boolean;
  sinistra?: boolean;
  destra?: boolean;
  striscia?: boolean;
};

export function Cornice({
  larghezza,
  altezza,
  zone,
  visibili,
}: {
  larghezza: number;
  altezza: number;
  zone: Zone;
  visibili: Visibili;
}) {
  const colonna = Math.min(LARGHEZZA_SCHERMO, larghezza / 3) - SPAZI.bordoSchermo * 2;

  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ width: larghezza, height: altezza, color: COLORI.testo }}
    >
      <div
        style={{
          ...assoluto(0, 0, larghezza, 140),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: visibili.alta ? 1 : 0,
          transition: TRANSIZIONE,
        }}
      >
        {zone.alta}
      </div>

      <div
        style={{
          ...assoluto(SPAZI.bordoSchermo, 180, colonna, altezza - 400),
          opacity: visibili.sinistra ? 1 : 0,
          transition: TRANSIZIONE,
        }}
      >
        {zone.sinistra}
      </div>

      <div
        style={{
          ...assoluto(larghezza - colonna - SPAZI.bordoSchermo, 180, colonna, altezza - 400),
          opacity: visibili.destra ? 1 : 0,
          transition: TRANSIZIONE,
        }}
      >
        {zone.destra}
      </div>

      <div
        style={{
          ...assoluto(0, altezza - 96, larghezza, 96),
          opacity: visibili.striscia ? 1 : 0,
          transition: TRANSIZIONE,
        }}
      >
        {zone.striscia}
      </div>
    </div>
  );
}

function assoluto(x: number, y: number, w: number, h: number): CSSProperties {
  return { position: "absolute", left: x, top: y, width: w, height: h };
}

/** La scatola di un pannello laterale. */
export function Pannello({ titolo, children }: { titolo?: string; children: ReactNode }) {
  return (
    <div
      style={{
        background: COLORI.fondo,
        border: `2px solid ${COLORI.bordo}`,
        borderRadius: 12,
        padding: SPAZI.interno,
      }}
    >
      {titolo ? (
        <div
          style={{
            fontSize: TIPI.minimo,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: COLORI.accento,
            marginBottom: SPAZI.riga * 1.5,
          }}
        >
          {titolo}
        </div>
      ) : null}
      {children}
    </div>
  );
}

/** Una riga etichetta-valore, la forma piu' frequente sui pannelli. */
export function Riga({
  etichetta,
  valore,
  grande = false,
}: {
  etichetta: string;
  valore: ReactNode;
  grande?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: SPAZI.interno,
        paddingTop: SPAZI.riga / 2,
        paddingBottom: SPAZI.riga / 2,
      }}
    >
      <span style={{ fontSize: TIPI.minimo, color: COLORI.smorzato }}>{etichetta}</span>
      <span
        style={{
          fontSize: grande ? TIPI.numero : TIPI.corrente,
          fontVariantNumeric: "tabular-nums",
          color: grande ? COLORI.accento : COLORI.testo,
        }}
      >
        {valore}
      </span>
    </div>
  );
}

/**
 * La striscia di contesto: dove siamo, quanti negozi, quanto vale.
 *
 * E' l'unico elemento presente per tutta la sessione. Serve a chi entra a meta'
 * e a chi ha perso il filo, che in una sala sono la maggioranza.
 */
export function Striscia({ voci, sfocata = false }: { voci: string[]; sfocata?: boolean }) {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: SPAZI.interno,
        // Con la sfocatura il fondo si alleggerisce: altrimenti sfocherebbe
        // qualcosa che non si vede comunque, che e' il modo piu' rapido di
        // pagare un effetto senza ottenerlo.
        background: sfocata ? "rgba(8, 10, 14, 0.42)" : COLORI.fondo,
        backdropFilter: sfocata ? "blur(14px)" : undefined,
        borderTop: `2px solid ${COLORI.bordo}`,
        fontSize: TIPI.corrente,
      }}
    >
      {voci.map((v, i) => (
        <span key={v} style={{ color: i === 0 ? COLORI.testo : COLORI.smorzato }}>
          {i > 0 ? <span style={{ color: COLORI.bordo, marginRight: SPAZI.interno }}>·</span> : null}
          {v}
        </span>
      ))}
    </div>
  );
}
