"use client";

import type { Barra } from "@/lib/viz/profilo";

/**
 * Il profilo come disegno.
 *
 * Nessuna libreria di grafici: le barre sono rettangoli, e su una superficie
 * che un domani sara' larga 5760 pixel conviene sapere esattamente quanti nodi
 * finiscono nel documento. La dimensione arriva da fuori, cosi' lo stesso
 * componente serve una scheda e un pannello del muro.
 */
export function Profilo({
  barre,
  larghezza = 280,
  altezza = 64,
}: {
  barre: Barra[];
  larghezza?: number;
  altezza?: number;
}) {
  if (!barre.length) return <div style={{ height: altezza }} />;

  const passo = larghezza / barre.length;
  const spessore = Math.max(2, passo - 2);

  return (
    <svg
      width="100%"
      height={altezza}
      viewBox={`0 0 ${larghezza} ${altezza}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="profilo del potenziale inespresso attorno all'area"
    >
      {barre.map((b, i) => {
        // Un'altezza minima visibile: una colonna a zero sparisce, e una
        // colonna che sparisce si legge come "qui non ci sono dati" invece che
        // "qui il potenziale e' basso".
        const h = Math.max(1.5, b.altezza * (altezza - 2));
        return (
          <rect
            key={i}
            x={i * passo + (passo - spessore) / 2}
            y={altezza - h}
            width={spessore}
            height={h}
            fill={b.della ? "#ffb35c" : "#ffffff"}
            opacity={b.della ? 1 : 0.18}
          />
        );
      })}
    </svg>
  );
}
