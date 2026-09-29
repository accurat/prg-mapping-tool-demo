"use client";

import { COLORI } from "@/components/wall/tokens";

export type P0DataMode = "stores" | "network";
export type P0MapView = "globe" | "map";

interface P0NavMenuProps {
  dataMode: P0DataMode;
  onDataToggle: () => void;
  mapView: P0MapView;
  onMapViewToggle: () => void;
  onCenterUsa: () => void;
}

type NavItem = {
  label: string;
  value: string;
  onClick: () => void;
};

/**
 * Controlli navigabili: stesso chrome tipografico del pannello contesto in alto.
 */
export function P0NavMenu({
  dataMode,
  onDataToggle,
  mapView,
  onMapViewToggle,
  onCenterUsa,
}: P0NavMenuProps) {
  const items: NavItem[] = [
    {
      label: "Data",
      value: dataMode === "stores" ? "Store" : "Network",
      onClick: onDataToggle,
    },
    {
      label: "View",
      value: mapView === "globe" ? "Globe" : "Map",
      onClick: onMapViewToggle,
    },
    {
      label: "Frame",
      value: "Center",
      onClick: onCenterUsa,
    },
  ];

  return (
    <div
      className="pointer-events-auto"
      style={{
        display: "flex",
        flexDirection: "column",
        background: COLORI.fondo,
        borderRadius: 10,
        border: `1.5px solid ${COLORI.bordo}`,
        overflow: "hidden",
        minWidth: 200,
      }}
    >
      {items.map((item, i) => (
        <button
          key={item.label}
          type="button"
          onClick={item.onClick}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 4,
            padding: "14px 28px",
            background: "transparent",
            border: "none",
            borderTop: i === 0 ? undefined : `1px solid ${COLORI.bordo}`,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <span
            style={{
              fontSize: 24,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: COLORI.smorzato,
            }}
          >
            {item.label}
          </span>
          <span
            style={{
              fontSize: 48,
              fontWeight: 600,
              color: "#6B7EF1",
              lineHeight: 1.1,
            }}
          >
            {item.value}
          </span>
        </button>
      ))}
    </div>
  );
}
