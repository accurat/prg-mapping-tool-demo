"use client";

import { COLORI } from "@/components/wall/tokens";
import type {
  DemoCategory,
  DemoColumn,
  DemoMetricSummary,
} from "@/lib/lab/demographics";
import { DEMO_BUCKETS } from "@/lib/lab/demographics";
import { conta, percentuale } from "@/lib/format";

/** Storie disponibili come viste. */
export const P0_STORY_VIEWS = [
  "Explore demographics",
  "Open field",
  "Under siege",
  "The concentration",
  "Diverging twins",
  "Model anomalies",
] as const;

export type P0StoryView = (typeof P0_STORY_VIEWS)[number];

export const P0_VIEWS_PANEL_WIDTH = 980;

interface P0ViewsPanelProps {
  visible: boolean;
  activeStory: P0StoryView | null;
  onStorySelect: (story: P0StoryView) => void;
  categories?: DemoCategory[];
  categoryId?: string;
  columnId?: string;
  onCategoryChange?: (categoryId: string) => void;
  onColumnChange?: (columnId: string) => void;
  metricSummary?: DemoMetricSummary | null;
  metricLabel?: string;
}

const selectStyle: import("react").CSSProperties = {
  width: "100%",
  marginTop: 8,
  padding: "12px 14px",
  fontSize: 28,
  fontWeight: 600,
  color: "#6B7EF1",
  background: "rgba(255,255,255,0.04)",
  border: `1px solid ${COLORI.bordo}`,
  borderRadius: 8,
  outline: "none",
  cursor: "pointer",
};

/** Pannello storie + controlli demographics (indici Shopper Trait). */
export function P0ViewsPanel({
  visible,
  activeStory,
  onStorySelect,
  categories = [],
  categoryId,
  columnId,
  onCategoryChange,
  onColumnChange,
  metricSummary,
  metricLabel,
}: P0ViewsPanelProps) {
  const demoOpen = activeStory === "Explore demographics";
  const columns: DemoColumn[] =
    categories.find((c) => c.id === categoryId)?.columns ?? [];

  return (
    <div
      className="pointer-events-auto"
      style={{
        width: P0_VIEWS_PANEL_WIDTH,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateX(0)" : "translateX(24px)",
        transition:
          "opacity 450ms cubic-bezier(0.4, 0, 0.2, 1), transform 500ms cubic-bezier(0.4, 0, 0.2, 1)",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          background: COLORI.fondo,
          borderRadius: 10,
          border: `1.5px solid ${COLORI.bordo}`,
          overflow: "hidden",
          width: P0_VIEWS_PANEL_WIDTH,
          maxHeight: 920,
        }}
      >
        <div style={{ overflowY: "auto", flex: 1 }}>
          {demoOpen ? (
            <div
              style={{
                padding: "24px 36px 32px",
                display: "flex",
                flexDirection: "column",
                gap: 20,
              }}
            >
              <div
                style={{
                  fontSize: 36,
                  fontWeight: 600,
                  color: "#6B7EF1",
                  lineHeight: 1.2,
                }}
              >
                Explore demographics
              </div>

              <div>
                <div
                  style={{
                    fontSize: 20,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: COLORI.smorzato,
                  }}
                >
                  Category
                </div>
                <select
                  value={categoryId ?? ""}
                  onChange={(e) => onCategoryChange?.(e.target.value)}
                  style={selectStyle}
                >
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.id}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div
                  style={{
                    fontSize: 20,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: COLORI.smorzato,
                  }}
                >
                  Metric
                </div>
                <select
                  value={columnId ?? ""}
                  onChange={(e) => onColumnChange?.(e.target.value)}
                  style={selectStyle}
                >
                  {columns.map((col) => (
                    <option key={col.id} value={col.id}>
                      {col.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* scala colori bucket */}
              <div>
                <div
                  style={{
                    fontSize: 20,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: COLORI.smorzato,
                    marginBottom: 10,
                  }}
                >
                  Index scale · baseline 100
                </div>
                <div
                  style={{
                    display: "flex",
                    height: 28,
                    borderRadius: 6,
                    overflow: "hidden",
                  }}
                >
                  {DEMO_BUCKETS.names.map((name, i) => (
                    <div
                      key={name}
                      style={{
                        flex: 1,
                        background: DEMO_BUCKETS.colors[i],
                        opacity: 0.5,
                      }}
                      title={name}
                    />
                  ))}
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginTop: 6,
                    fontSize: 16,
                    color: COLORI.smorzato,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  <span>0</span>
                  <span>90</span>
                  <span>100</span>
                  <span>110+</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    marginTop: 4,
                    fontSize: 16,
                    color: COLORI.smorzato,
                  }}
                >
                  {DEMO_BUCKETS.names.map((name) => (
                    <span key={name} style={{ flex: 1, textAlign: "center" }}>
                      {name}
                    </span>
                  ))}
                </div>
              </div>

              {metricSummary ? (
                <div>
                  <div
                    style={{
                      fontSize: 20,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: COLORI.smorzato,
                      marginBottom: 12,
                    }}
                  >
                    USA · {metricLabel ?? "metric"}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 24,
                      marginBottom: 16,
                      fontSize: 22,
                      color: COLORI.testo,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    <span>
                      <span style={{ color: COLORI.smorzato }}>avg </span>
                      {metricSummary.avg.toFixed(0)}
                    </span>
                    <span>
                      <span style={{ color: COLORI.smorzato }}>min </span>
                      {metricSummary.min.toFixed(0)}
                    </span>
                    <span>
                      <span style={{ color: COLORI.smorzato }}>max </span>
                      {metricSummary.max.toFixed(0)}
                    </span>
                  </div>

                  {/* distribuzione store per bucket — rispecchia i colori in mappa */}
                  <div
                    style={{
                      display: "flex",
                      height: 56,
                      borderRadius: 6,
                      overflow: "hidden",
                      marginBottom: 14,
                    }}
                  >
                    {metricSummary.buckets.map((b) => (
                      <div
                        key={b.name}
                        style={{
                          width: `${Math.max(b.share * 100, b.share > 0 ? 2 : 0)}%`,
                          background: b.color,
                          opacity: 0.5,
                        }}
                        title={`${b.name}: ${conta(b.count)}`}
                      />
                    ))}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {metricSummary.buckets.map((b) => (
                      <div
                        key={b.name}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          fontSize: 22,
                          color: COLORI.testo,
                        }}
                      >
                        <span
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: 3,
                            background: b.color,
                            opacity: 0.5,
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ flex: 1 }}>{b.name}</span>
                        <span style={{ color: COLORI.smorzato, fontVariantNumeric: "tabular-nums" }}>
                          {conta(b.count)}
                        </span>
                        <span
                          style={{
                            width: 56,
                            textAlign: "right",
                            fontWeight: 600,
                            color: "#6B7EF1",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {percentuale(b.share, { decimali: 0 })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            P0_STORY_VIEWS.map((story, i) => (
              <button
                key={story}
                type="button"
                onClick={() => onStorySelect(story)}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "24px 36px",
                  background: "transparent",
                  border: "none",
                  borderTop: i === 0 ? undefined : `1px solid ${COLORI.bordo}`,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span
                  style={{
                    fontSize: 36,
                    fontWeight: 600,
                    color: COLORI.testo,
                    lineHeight: 1.2,
                  }}
                >
                  {story}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
