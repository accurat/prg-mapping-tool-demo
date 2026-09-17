"use client";

import type { ReactNode } from "react";

export function Hud({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-4 font-mono text-xs text-white">
      {children}
    </div>
  );
}

export function HudPanel({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="pointer-events-auto inline-block rounded border border-white/15 bg-black/70 px-3 py-2 backdrop-blur">
      {title ? (
        <div className="mb-1 text-[10px] uppercase tracking-widest text-white/40">{title}</div>
      ) : null}
      {children}
    </div>
  );
}

export function Row({
  label,
  value,
  tone = "normal",
}: {
  label: string;
  value: ReactNode;
  tone?: "normal" | "good" | "warn" | "bad";
}) {
  const color =
    tone === "good"
      ? "text-emerald-400"
      : tone === "warn"
        ? "text-amber-400"
        : tone === "bad"
          ? "text-red-400"
          : "text-white";
  return (
    <div className="flex items-baseline gap-3 leading-5">
      <span className="w-40 shrink-0 text-white/45">{label}</span>
      <span className={`tabular-nums ${color}`}>{value}</span>
    </div>
  );
}

/** Verde sopra 55, ambra sopra 30, rosso sotto: le soglie del masterplan. */
export function fpsTone(fps: number): "good" | "warn" | "bad" {
  if (fps >= 55) return "good";
  if (fps >= 30) return "warn";
  return "bad";
}
