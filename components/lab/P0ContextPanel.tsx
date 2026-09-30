"use client";

import { COLORI } from "@/components/wall/tokens";

export type ContextStat = {
  label: string;
  value: string;
  /** Se true, la cella e' cliccabile (es. reset Selection). */
  onClick?: () => void;
};

/**
 * Fascia di contesto in alto sullo Stage: titolo della vista + aggregati.
 * Visibile solo dopo la discesa (mappa navigabile).
 */
export function P0ContextPanel({
  title,
  stats,
  visible,
}: {
  title: string;
  stats: ContextStat[];
  visible: boolean;
}) {
  return (
    <div
      className="pointer-events-none absolute left-0 right-0 top-0 z-20 flex justify-center"
      style={{
        opacity: visible ? 1 : 0,
        transition: "opacity 900ms cubic-bezier(0.4, 0, 0.2, 1)",
        paddingTop: 22,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          gap: 0,
          background: COLORI.fondo,
          borderRadius: 10,
          border: `1.5px solid ${COLORI.bordo}`,
          minHeight: 88,
          padding: "12px 32px",
          whiteSpace: "nowrap",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 4,
            paddingLeft: 8,
            paddingRight: 36,
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
            Now viewing
          </span>
          <span
            style={{
              fontSize: 40,
              fontWeight: 600,
              color: "#6B7EF1",
              lineHeight: 1.1,
              whiteSpace: "nowrap",
            }}
          >
            {title}
          </span>
        </div>

        {stats.map((stat) => {
          const clickable = Boolean(stat.onClick);
          const cellStyle = {
            display: "flex",
            flexDirection: "column" as const,
            justifyContent: "center",
            gap: 4,
            paddingLeft: 32,
            paddingRight: 32,
            borderLeft: `1px solid ${COLORI.bordo}`,
            minWidth: 180,
            cursor: clickable ? "pointer" : "default",
            pointerEvents: clickable ? ("auto" as const) : ("none" as const),
          };

          if (clickable) {
            return (
              <button
                key={stat.label}
                type="button"
                onClick={stat.onClick}
                aria-label={`Reset ${stat.label} to United States`}
                style={{
                  ...cellStyle,
                  background: "transparent",
                  borderTop: "none",
                  borderRight: "none",
                  borderBottom: "none",
                  textAlign: "left",
                  font: "inherit",
                  color: "inherit",
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
                  {stat.label}
                </span>
                <span
                  style={{
                    fontSize: 48,
                    fontWeight: 600,
                    color: "#6B7EF1",
                    fontVariantNumeric: "tabular-nums",
                    lineHeight: 1.1,
                  }}
                >
                  {stat.value}
                </span>
              </button>
            );
          }

          return (
            <div key={stat.label} style={cellStyle}>
              <span
                style={{
                  fontSize: 24,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: COLORI.smorzato,
                }}
              >
                {stat.label}
              </span>
              <span
                style={{
                  fontSize: 48,
                  fontWeight: 600,
                  color: "#6B7EF1",
                  fontVariantNumeric: "tabular-nums",
                  lineHeight: 1.1,
                }}
              >
                {stat.value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
