"use client";

import type { Storia } from "@/lib/stories/tipi";
import type { Barra } from "@/lib/viz/profilo";
import { Profilo } from "./Profilo";

/**
 * La scheda di una storia.
 *
 * L'ordine e' quello con cui si leggerebbe ad alta voce: cosa e' stato trovato,
 * dove, quanto vale, e con quali numeri lo si dimostra. L'archetipo sta in alto
 * perche' e' l'etichetta che permette di saltare le schede che non interessano.
 */
export function Scheda({
  storia,
  barre,
  scelta,
  onScegli,
}: {
  storia: Storia;
  barre: Barra[];
  scelta: boolean;
  onScegli: () => void;
}) {
  const principali = storia.numeri.filter((n) => n.principale);

  return (
    <button
      type="button"
      onClick={onScegli}
      className={`flex w-[19rem] shrink-0 snap-start flex-col gap-4 rounded-lg border p-5 text-left transition-colors ${
        scelta
          ? "border-amber-400/70 bg-amber-400/5"
          : "border-white/10 bg-white/[0.02] hover:border-white/25"
      }`}
    >
      <Profilo barre={barre} />

      <div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-amber-300/80">
          {storia.titolo}
        </div>
        <div className="mt-1 text-lg leading-tight text-white">{storia.luogo}</div>
      </div>

      <p className="text-sm leading-relaxed text-white/55">{storia.testo}</p>

      <dl className="mt-auto flex flex-col gap-1 border-t border-white/10 pt-3 font-mono text-xs">
        {principali.map((n) => (
          <div key={n.etichetta} className="flex items-baseline justify-between gap-3">
            <dt className="text-white/40">{n.etichetta}</dt>
            <dd className="tabular-nums text-white">{n.valore}</dd>
          </div>
        ))}
      </dl>
    </button>
  );
}
