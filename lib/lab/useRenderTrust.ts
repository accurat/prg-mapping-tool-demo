"use client";

import { useEffect, useState } from "react";

export type RenderTrust = {
  hidden: boolean;
  focused: boolean;
  /** Vero quando i numeri raccolti non sono attendibili. */
  suspect: boolean;
  reason: string | null;
};

/**
 * Stabilisce se la misura in corso e' credibile.
 *
 * Serve perche' il browser smette di produrre fotogrammi quando la finestra e'
 * in secondo piano **o semplicemente coperta da un'altra finestra**, e nel
 * secondo caso `visibilityState` continua a dire "visible": si leggerebbero
 * due fotogrammi al secondo credendo che sia un problema di prestazioni.
 *
 * Un fotogramma sopra i 60 ms su una scena banale non e' una scheda video
 * lenta: e' il browser che ha smesso di disegnare.
 */
export function useRenderTrust(medianMs: number): RenderTrust {
  const [hidden, setHidden] = useState(false);
  const [focused, setFocused] = useState(true);

  useEffect(() => {
    const sync = () => {
      setHidden(document.hidden);
      setFocused(document.hasFocus());
    };
    sync();
    const id = window.setInterval(sync, 500);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);
    window.addEventListener("blur", sync);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener("blur", sync);
    };
  }, []);

  const starved = medianMs > 60;

  let reason: string | null = null;
  if (hidden) reason = "scheda in secondo piano: il browser ha sospeso il disegno";
  else if (starved && !focused)
    reason = "finestra coperta o non attiva: portala in primo piano e rimisura";
  else if (starved)
    reason = "meno di 16 fotogrammi al secondo: verifica che la finestra sia davvero visibile";

  return { hidden, focused, suspect: reason !== null, reason };
}
