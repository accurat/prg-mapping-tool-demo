"use client";

import { ColumnLayer, MapLibreOverlay } from "deck.gl";
import { useEffect, useRef } from "react";
import type { MapHandle } from "@/components/lab/MapSurface";
import type { HexCell } from "@/lib/lab/hexGrid";

export type DeckMode = "sovrapposto" | "interlacciato";

/**
 * Colonne esagonali disegnate da deck.gl sopra la mappa.
 *
 * Le due modalita' sono due architetture diverse, non un'opzione:
 * - **sovrapposto**: deck.gl disegna su una tela propria davanti alla mappa;
 * - **interlacciato**: i layer entrano nella pila della mappa e condividono il
 *   suo contesto grafico, quindi possono stare *sotto* le etichette e dietro
 *   la geometria della mappa.
 *
 * `interleaved` si decide alla costruzione del controllo, quindi cambiare
 * modalita' significa ricostruirlo: e' il motivo per cui la modalita' e' fra
 * le dipendenze dell'effetto.
 */
export function DeckColumns({
  map,
  cells,
  mode,
  radiusMeters,
  maxElevationMeters,
  beforeId,
}: {
  map: MapHandle | null;
  cells: HexCell[];
  mode: DeckMode;
  radiusMeters: number;
  maxElevationMeters: number;
  /** Solo in modalita' interlacciata: sotto quale livello della mappa inserirsi. */
  beforeId?: string;
}) {
  const overlayRef = useRef<MapLibreOverlay | null>(null);

  useEffect(() => {
    if (!map) return;
    const overlay = new MapLibreOverlay({
      interleaved: mode === "interlacciato",
      layers: [],
    });
    map.addControl(overlay);
    overlayRef.current = overlay;
    return () => {
      overlayRef.current = null;
      map.removeControl(overlay);
    };
  }, [map, mode]);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    overlay.setProps({
      layers: [
        new ColumnLayer<HexCell>({
          id: "colonne",
          data: cells,
          // Sei lati: e' quello che rende la colonna esagonale invece che tonda.
          diskResolution: 6,
          radius: radiusMeters,
          extruded: true,
          pickable: false,
          getPosition: (d) => d.position,
          getElevation: (d) => d.value * maxElevationMeters,
          getFillColor: (d) => {
            // Chiaro dove il valore e' alto, cosi' altezza e colore dicono la
            // stessa cosa: qui serve solo a rendere leggibile il rilievo, nel
            // prodotto il colore portera' un'altra informazione.
            const t = d.value;
            return [40 + t * 120, 90 + t * 110, 150 + t * 90, 210];
          },
          ...(mode === "interlacciato" && beforeId ? { beforeId } : {}),
        }),
      ],
    });
  }, [cells, radiusMeters, maxElevationMeters, mode, beforeId]);

  return null;
}
