"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { MapHandle } from "@/components/lab/MapSurface";
import { COLORI, TIPI } from "@/components/wall/tokens";
import type { EtichettaHub } from "@/lib/scena/sequenza";

/**
 * I nomi degli hub, con il loro connettore.
 *
 * Vivono **solo** sull'inquadratura del paese, dove i punti di rifornimento
 * sono lontani e piccoli e senza un nome sono macchie uguali fra loro.
 * Scendendo spariscono: da vicino il territorio dice gia' dove si e', e
 * un'etichetta che resta diventa un ingombro proprio sopra la cosa che si e'
 * venuti a guardare.
 *
 * **Sono testo del documento, non testo disegnato dalla scheda video.** Il
 * TextLayer di deck.gl in questa scena non riesce a costruire il proprio
 * atlante dei caratteri — `texSubImage2D: no canvas` — e lascia le etichette
 * invisibili senza che niente si rompa. Ma anche funzionando sarebbe la scelta
 * peggiore: qui il testo resta nitido a qualsiasi scala, usa gli stessi corpi
 * del muro e quindi la stessa soglia dei 36 pixel, e T12 ha misurato che
 * comporre testo sopra il canvas non costa fotogrammi.
 *
 * Le posizioni si ricalcolano a ogni fotogramma finche' si vedono: la camera
 * si muove durante la dissolvenza in uscita, e delle etichette ferme mentre il
 * territorio scorre sotto si leggerebbero come un errore.
 */
export function EtichetteHub({
  map,
  etichette,
  opacita,
  larghezza,
  altezza,
}: {
  map: MapHandle | null;
  etichette: EtichettaHub[];
  opacita: RefObject<number>;
  larghezza: number;
  altezza: number;
}) {
  const gruppo = useRef<SVGGElement>(null);
  const nodi = useRef<{ linea: SVGLineElement; testo: SVGTextElement }[]>([]);

  useEffect(() => {
    if (!map || !etichette.length) return;
    let raf = 0;
    let visibileprima = false;

    const passo = () => {
      raf = requestAnimationFrame(passo);
      const alfa = opacita.current;
      const visibile = alfa > 0.002;

      // Quando non si vedono non si calcola niente: per quasi tutta la
      // sequenza questo ciclo costa un confronto.
      if (!visibile) {
        if (visibileprima && gruppo.current) gruppo.current.style.opacity = "0";
        visibileprima = false;
        return;
      }
      visibileprima = true;
      if (gruppo.current) gruppo.current.style.opacity = String(alfa);

      etichette.forEach((e, i) => {
        const nodo = nodi.current[i];
        if (!nodo) return;
        const da = map.project(e.da);
        const a = map.project(e.a);
        nodo.linea.setAttribute("x1", String(da.x));
        nodo.linea.setAttribute("y1", String(da.y));
        nodo.linea.setAttribute("x2", String(a.x));
        nodo.linea.setAttribute("y2", String(a.y));
        nodo.testo.setAttribute("x", String(a.x + (e.aDestra ? 18 : -18)));
        nodo.testo.setAttribute("y", String(a.y));
      });
    };

    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [map, etichette, opacita]);

  if (!etichette.length) return null;

  return (
    <svg
      className="pointer-events-none absolute left-0 top-0"
      width={larghezza}
      height={altezza}
      aria-hidden
    >
      <g ref={gruppo} style={{ opacity: 0 }}>
        {etichette.map((e, i) => (
          <g key={e.nome}>
            <line
              ref={(el) => {
                if (el) nodi.current[i] = { ...(nodi.current[i] ?? {}), linea: el } as never;
              }}
              stroke={COLORI.accento}
              strokeOpacity={0.75}
              strokeWidth={3}
            />
            <text
              ref={(el) => {
                if (el) nodi.current[i] = { ...(nodi.current[i] ?? {}), testo: el } as never;
              }}
              fill={COLORI.testo}
              fontSize={TIPI.minimo}
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              fontWeight={600}
              dominantBaseline="middle"
              textAnchor={e.aDestra ? "start" : "end"}
            >
              {e.nome}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
