"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Contenitore che rende disponibile un'area delle dimensioni logiche richieste
 * (per esempio 5760x1080) e la riduce otticamente per stare nella finestra.
 *
 * Il punto: il contenuto dentro allo Stage lavora davvero alla risoluzione
 * richiesta. La riduzione e' una trasformazione di presentazione, quindi la
 * scheda video continua a disegnare tutti i pixel. E' l'unico modo di misurare
 * il carico del muro senza avere il muro.
 */
export function Stage({
  width,
  height,
  children,
  onScaleChange,
}: {
  width: number;
  height: number;
  children: ReactNode;
  onScaleChange?: (scale: number) => void;
}) {
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const fit = () => {
      const next = Math.min(window.innerWidth / width, window.innerHeight / height);
      setScale(next);
      onScaleChange?.(next);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
    // onScaleChange e' volutamente escluso: cambierebbe a ogni render del padre.
  }, [width, height]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="flex items-center justify-center overflow-hidden"
      style={{ width: "100vw", height: "100vh" }}
    >
      <div
        style={{
          width,
          height,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
          flex: "none",
          // stroke in pixel schermo: 1px indipendentemente dallo scale ottico
          boxShadow: scale > 0 ? `0 0 0 ${1 / scale}px white` : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}
