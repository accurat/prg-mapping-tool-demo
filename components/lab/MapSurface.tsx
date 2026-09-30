"use client";

import { MapLibreMap, setWorkerUrl } from "maplibre-gl";
import { useEffect, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoBounds } from "@/lib/lab/geoSelection";
import { boundsFromScreenBox } from "@/lib/lab/geoSelection";

export type MapHandle = MapLibreMap;

// Il worker viene servito da public/ invece che dal bundle: vedi
// scripts/sync-maplibre-worker.mjs per il motivo.
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

/**
 * Mappa MapLibre alle dimensioni logiche richieste.
 *
 * Il rapporto pixel e' fissato a 1: MapLibre userebbe altrimenti quello dello
 * schermo, e su un portatile ad alta densita' il buffer diventerebbe 11520 x
 * 2160, cioe' quattro volte il carico del muro.
 */
export function MapSurface({
  width,
  height,
  styleUrl,
  projection,
  maxTileCacheZoomLevels = 24,
  preserveDrawingBuffer = false,
  onBoxSelect,
  onReady,
}: {
  width: number;
  height: number;
  styleUrl: string;
  projection: "globe" | "mercator";
  /**
   * Per quanti livelli di zoom la cache trattiene le tessere. Il valore
   * predefinito della libreria basta per navigare, non per una discesa che
   * attraversa quindici livelli: le tessere dei primi livelli verrebbero
   * sfrattate prima che il volo le raggiunga, rendendo inutile qualsiasi
   * precaricamento.
   */
  maxTileCacheZoomLevels?: number;
  /**
   * Necessario per rileggere il contenuto del canvas a valle del disegno.
   * Costa, quindi si attiva solo nelle pagine di diagnosi.
   */
  preserveDrawingBuffer?: boolean;
  /**
   * Se presente, Shift+drag seleziona l'area (niente zoom automatico).
   * Il callback riceve i bounds geografici del box.
   */
  onBoxSelect?: (bounds: GeoBounds) => void;
  onReady?: (map: MapHandle) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const onBoxSelectRef = useRef(onBoxSelect);
  onBoxSelectRef.current = onBoxSelect;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = new MapLibreMap({
      container,
      style: styleUrl,
      center: [-94.578, 39.1],
      zoom: 0,
      pitch: 0,
      pixelRatio: 1,
      // Il valore predefinito e' 4096 e 5760 lo supera: MapLibre ridurrebbe da
      // solo la risoluzione, e misureremmo un muro piu' piccolo di quello vero.
      maxCanvasSize: [8192, 8192],
      maxTileCacheZoomLevels,
      attributionControl: false,
      // Shift+drag: selezione se c'e' onBoxSelect, altrimenti fitBounds di default
      boxZoom: {
        boxZoomEnd: (m, startPos, endPos) => {
          const bounds = boundsFromScreenBox(
            (p) => m.unproject([p.x, p.y]),
            startPos,
            endPos,
          );
          if (onBoxSelectRef.current) {
            onBoxSelectRef.current(bounds);
            return;
          }
          m.fitBounds(
            [
              [bounds.west, bounds.south],
              [bounds.east, bounds.north],
            ],
            {padding: 20},
          );
        },
      },
      canvasContextAttributes: {
        antialias: false,
        // serve allo stencil union dei cerchi 2d in P0 (e ad altri layer deck)
        stencil: true,
        powerPreference: "high-performance",
        preserveDrawingBuffer,
      },
    });
    mapRef.current = map;

    map.on("load", () => {
      map.setProjection({ type: projection });
      // In sviluppo la mappa e' raggiungibile dalla Console.
      //
      // Serve a rispondere a domande come «a che zoom siamo adesso» senza
      // ricostruirle da una formula: un'approssimazione della matematica di
      // MapLibre e' gia' stata la causa di un'inquadratura sbagliata, e averla
      // sottomano evita di ripetere l'errore.
      if (process.env.NODE_ENV === "development") {
        (window as unknown as { mappa?: MapLibreMap }).mappa = map;
      }
      onReady?.(map);
    });

    return () => {
      mapRef.current = null;
      map.remove();
    };
    // La mappa viene ricreata solo al cambio di stile o dimensione: la
    // proiezione si aggiorna nell'effetto sotto, senza ricostruire tutto.
    // onBoxSelect e' letto via ref: non ricostruisce la mappa a ogni render.
  }, [styleUrl, width, height, maxTileCacheZoomLevels, preserveDrawingBuffer]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.isStyleLoaded()) map.setProjection({ type: projection });
    else map.once("load", () => map.setProjection({ type: projection }));
  }, [projection]);

  return <div ref={containerRef} style={{ width, height }} />;
}
