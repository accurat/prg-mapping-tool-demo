"use client";

import { useState } from "react";
import { COLORI } from "@/components/wall/tokens";

/** Storie disponibili come viste (placeholder UI). */
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
  onStorySelect?: (story: P0StoryView) => void;
}

/** Pannello storie: elemento distinto dal navigation menu. */
export function P0ViewsPanel({ visible, onStorySelect }: P0ViewsPanelProps) {
  const [activeStory, setActiveStory] = useState<P0StoryView | null>(null);

  const pickStory = (story: P0StoryView) => {
    setActiveStory(story);
    onStorySelect?.(story);
  };

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
        }}
      >
        <div
          style={{
            padding: "22px 36px 16px",
            borderBottom: `1px solid ${COLORI.bordo}`,
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
            Add a view
          </span>
          <div
            style={{
              fontSize: 48,
              fontWeight: 600,
              color: "#6B7EF1",
              lineHeight: 1.1,
              marginTop: 4,
              whiteSpace: "nowrap",
            }}
          >
            Stories
          </div>
        </div>

        {P0_STORY_VIEWS.map((story, i) => {
          const active = activeStory === story;
          return (
            <button
              key={story}
              type="button"
              onClick={() => pickStory(story)}
              style={{
                display: "block",
                width: "100%",
                padding: "28px 36px",
                background: active ? "rgba(107, 126, 241, 0.12)" : "transparent",
                border: "none",
                borderTop: i === 0 ? undefined : `1px solid ${COLORI.bordo}`,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <span
                style={{
                  fontSize: 42,
                  fontWeight: 600,
                  color: active ? "#6B7EF1" : COLORI.testo,
                  lineHeight: 1.2,
                }}
              >
                {story}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
