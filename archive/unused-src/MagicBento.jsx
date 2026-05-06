import { useState } from "react";
import { C } from "./caredrop/theme";

export default function MagicBento({ items = [] }) {
  const [hoveredIndex, setHoveredIndex] = useState(null);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 14,
      }}
    >
      {items.map((item, index) => {
        const interactive = item.interactive !== false;
        const hovered = hoveredIndex === index && interactive;

        return (
          <button
            key={`${item.title}-${index}`}
            type="button"
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
            onClick={() => item.onClick?.()}
            style={{
              background: C.surface,
              border: hovered ? `1px solid ${C.accentMid}` : `1px solid ${C.border}`,
              borderRadius: 20,
              padding: 18,
              minHeight: item.colSpan === 2 ? 150 : 130,
              gridColumn: item.colSpan === 2 ? "span 2" : "span 1",
              boxShadow: hovered ? C.shellShadow : "none",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              textAlign: "left",
              cursor: interactive ? "pointer" : "default",
              transition: "all 0.2s ease",
            }}
            disabled={!interactive}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.accent }}>{item.icon}</div>
              {!!item.tags?.length && (
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "4px 8px",
                    borderRadius: 999,
                    background: C.pill,
                    color: C.muted,
                    textTransform: "uppercase",
                  }}
                >
                  {item.tags[0]}
                </div>
              )}
            </div>

            <div>
              <div
                style={{
                  fontSize: item.colSpan === 2 ? 18 : 28,
                  fontWeight: 800,
                  color: C.text,
                  lineHeight: 1.2,
                }}
              >
                {item.title}
              </div>
              <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: C.muted }}>
                {item.description}
              </div>
              {item.status ? (
                <div style={{ marginTop: 8, fontSize: 12, color: C.faint }}>
                  {hovered && item.hoverText ? item.hoverText : item.status}
                </div>
              ) : null}
              {hovered && item.actionLabel ? (
                <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: C.accent }}>
                  {item.actionLabel}
                </div>
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}
