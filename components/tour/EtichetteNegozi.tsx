"use client";

import { useEffect, useRef } from "react";
import { COLORI, TIPI } from "@/components/wall/tokens";

/**
 * I nomi dei negozi piu' alti, in cima alle loro colonne.
 *
 * Tre elementi montati sempre, spostati a ogni fotogramma per trasformazione:
 * nessun nodo nuovo durante la sosta, e il testo si riscrive solo quando
 * cambia la tappa. Le posizioni arrivano dalla regia, che sa proiettare la
 * cima di una colonna; qui si disegna e basta.
 */

const MASSIMO = 3;

export function EtichetteNegozi({
  leggi,
}: {
  leggi: () => { voci: { x: number; y: number; testo: string }[]; opacita: number };
}) {
  const nodi = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    let raf = 0;
    const passo = () => {
      raf = requestAnimationFrame(passo);
      const { voci, opacita } = leggi();

      /**
       * Le etichette non si sovrappongono: se due si toccano, la seconda sale.
       *
       * I negozi con piu' potenziale stanno spesso nello stesso quartiere, e
       * due nomi stampati uno sull'altro non si leggono piu' nessuno dei due.
       * Le misure del riquadro si prendono dal nodo, che le conosce gia'.
       */
      const occupati: { x0: number; x1: number; y0: number; y1: number }[] = [];
      for (let i = 0; i < MASSIMO; i++) {
        const el = nodi.current[i];
        if (!el) continue;
        const voce = voci[i];
        if (!voce) {
          if (el.style.opacity !== "0") el.style.opacity = "0";
          continue;
        }
        if (el.textContent !== voce.testo) el.textContent = voce.testo;
        const larghezza = el.offsetWidth;
        const altezza = el.offsetHeight;
        const x0 = voce.x - larghezza / 2;
        let y1 = voce.y - 20;
        for (let giro = 0; giro < MASSIMO; giro++) {
          const urto = occupati.find(
            (r) => x0 < r.x1 && x0 + larghezza > r.x0 && y1 - altezza < r.y1 && y1 > r.y0,
          );
          if (!urto) break;
          y1 = urto.y0 - 10;
        }
        occupati.push({ x0, x1: x0 + larghezza, y0: y1 - altezza, y1 });
        el.style.opacity = String(opacita);
        el.style.transform = `translate(${x0}px, ${y1 - altezza}px)`;
      }
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [leggi]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: MASSIMO }, (_, i) => (
        <div
          key={i}
          ref={(el) => {
            nodi.current[i] = el;
          }}
          className="absolute left-0 top-0"
          style={{
            opacity: 0,
            whiteSpace: "nowrap",
            fontSize: TIPI.minimo,
            fontWeight: 600,
            color: COLORI.testo,
            background: "rgba(8, 10, 14, 0.85)",
            border: `2px solid ${COLORI.bordo}`,
            borderRadius: 8,
            padding: "8px 18px",
            willChange: "transform, opacity",
          }}
        />
      ))}
    </div>
  );
}
