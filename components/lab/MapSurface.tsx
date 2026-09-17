"use client";

import { MapLibreMap, setWorkerUrl } from "maplibre-gl";
import { useEffect, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";

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
  onReady?: (map: MapHandle) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);

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
      canvasContextAttributes: {
        antialias: false,
        powerPreference: "high-performance",
        preserveDrawingBuffer,
      },
    });
    mapRef.current = map;

    map.on("load", () => {
      map.setProjection({ type: projection });
      onReady?.(map);
    });

    return () => {
      mapRef.current = null;
      map.remove();
    };
    // La mappa viene ricreata solo al cambio di stile o dimensione: la
    // proiezione si aggiorna nell'effetto sotto, senza ricostruire tutto.
  }, [styleUrl, width, height, maxTileCacheZoomLevels, preserveDrawingBuffer]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.isStyleLoaded()) map.setProjection({ type: projection });
    else map.once("load", () => map.setProjection({ type: projection }));
  }, [projection]);

  return <div ref={containerRef} style={{ width, height }} />;
}
