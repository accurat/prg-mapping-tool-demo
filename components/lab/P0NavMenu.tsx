"use client";

import { Button } from "@/components/ui/button";

export type P0DataMode = "stores" | "network";
export type P0MapView = "globe" | "map";

interface P0NavMenuProps {
  dataMode: P0DataMode;
  onDataToggle: () => void;
  mapView: P0MapView;
  onMapViewToggle: () => void;
  onCenterUsa: () => void;
}

export function P0NavMenu({
  dataMode,
  onDataToggle,
  mapView,
  onMapViewToggle,
  onCenterUsa,
}: P0NavMenuProps) {
  const btn =
    "h-20 min-w-56 px-8 text-3xl font-semibold tracking-wide";

  return (
    <div className="dark pointer-events-auto flex flex-col gap-4">
      <Button
        type="button"
        variant="outline"
        className={btn}
        onClick={onDataToggle}
      >
        {dataMode === "stores" ? "Store" : "Network"}
      </Button>
      <Button
        type="button"
        variant="outline"
        className={btn}
        onClick={onMapViewToggle}
      >
        {mapView === "globe" ? "Globe" : "Map"}
      </Button>
      <Button
        type="button"
        variant="outline"
        className={btn}
        onClick={onCenterUsa}
      >
        Center
      </Button>
    </div>
  );
}
