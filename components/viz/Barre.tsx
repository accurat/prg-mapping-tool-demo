"use client";

import { COLORI, TIPI } from "@/components/wall/tokens";

export type Voce = {
  etichetta: string;
  /** Il valore della selezione, come frazione 0..1. */
  valore: number;
  /** Lo stesso valore per il perimetro di riferimento. */
  riferimento: number;
};

/**
 * Barre con il riferimento nazionale sopra.
 *
 * Nessuna libreria di grafici, per due ragioni concrete: la taglia minima del
 * testo e' un vincolo nostro che nessuna libreria rispetta di suo, e su una
 * superficie da 5760 pixel conviene sapere esattamente quanti nodi finiscono
 * nel documento.
 *
 * Il riferimento e' una tacca sulla stessa riga, non una seconda barra
 * affiancata: la domanda e' «quanto siamo lontani dalla media», e due barre
 * accostate costringono a misurare a occhio una differenza invece di vederla.
 * Il documento dei layout lo chiede esplicitamente in M9 — «sempre presente il
 * confronto con la media del perimetro».
 */
export function Barre({
  voci,
  larghezza,
  scala = 1,
}: {
  voci: Voce[];
  larghezza: number;
  /** 1 sul muro, meno su uno schermo: tutte le misure scendono insieme. */
  scala?: number;
}) {
  const massimo = Math.max(...voci.flatMap((v) => [v.valore, v.riferimento]), 0.0001);
  const altezzaRiga = 64 * scala;
  const spessore = 28 * scala;
  const etichetta = Math.max(12, TIPI.minimo * scala);
  const colonnaEtichette = larghezza * 0.32;
  const utile = larghezza - colonnaEtichette;

  return (
    <svg
      width="100%"
      height={voci.length * altezzaRiga}
      viewBox={`0 0 ${larghezza} ${voci.length * altezzaRiga}`}
      role="img"
      aria-label="comparison with the perimeter average"
    >
      {voci.map((v, i) => {
        const y = i * altezzaRiga;
        const lunghezza = (v.valore / massimo) * utile;
        const tacca = (v.riferimento / massimo) * utile;
        const sopra = v.valore >= v.riferimento;
        return (
          <g key={v.etichetta} transform={`translate(0 ${y})`}>
            <text
              x={0}
              y={altezzaRiga / 2}
              dominantBaseline="middle"
              fontSize={etichetta}
              fill={COLORI.smorzato}
            >
              {v.etichetta}
            </text>
            <rect
              x={colonnaEtichette}
              y={(altezzaRiga - spessore) / 2}
              width={Math.max(2, lunghezza)}
              height={spessore}
              fill={sopra ? COLORI.accento : COLORI.testo}
              opacity={sopra ? 1 : 0.55}
            />
            <rect
              x={colonnaEtichette + tacca - 1.5 * scala}
              y={(altezzaRiga - spessore) / 2 - 8 * scala}
              width={3 * scala}
              height={spessore + 16 * scala}
              fill={COLORI.riferimento}
            />
          </g>
        );
      })}
    </svg>
  );
}
