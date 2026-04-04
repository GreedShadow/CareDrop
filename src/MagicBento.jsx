import { useState } from "react";

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
              background: "#FFFFFF",
              border: hovered ? "1px solid #52B788" : "1px solid #E8E4DC",
              borderRadius: 20,
              padding: 18,
              minHeight: item.colSpan === 2 ? 150 : 130,
              gridColumn: item.colSpan === 2 ? "span 2" : "span 1",
              boxShadow: hovered
                ? "0 16px 30px rgba(82, 183, 136, 0.12)"
                : "0 10px 24px rgba(15, 23, 42, 0.06)",
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
              <div style={{ fontSize: 15, fontWeight: 800, color: "#2D6A4F" }}>{item.icon}</div>
              {!!item.tags?.length && (
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "4px 8px",
                    borderRadius: 999,
                    background: "#F0EDE6",
                    color: "#6B7280",
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
                  color: "#1A1A1A",
                  lineHeight: 1.2,
                }}
              >
                {item.title}
              </div>
              <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: "#6B7280" }}>
                {item.description}
              </div>
              {item.status ? (
                <div style={{ marginTop: 8, fontSize: 12, color: "#9CA3AF" }}>
                  {hovered && item.hoverText ? item.hoverText : item.status}
                </div>
              ) : null}
              {hovered && item.actionLabel ? (
                <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: "#2D6A4F" }}>
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
