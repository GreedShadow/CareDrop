export default function MagicBento({ items = [] }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 14,
      }}
    >
      {items.map((item, index) => (
        <div
          key={`${item.title}-${index}`}
          style={{
            background: "#FFFFFF",
            border: "1px solid #E8E4DC",
            borderRadius: 20,
            padding: 18,
            minHeight: item.colSpan === 2 ? 150 : 130,
            gridColumn: item.colSpan === 2 ? "span 2" : "span 1",
            boxShadow: "0 10px 24px rgba(15, 23, 42, 0.06)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ fontSize: 26 }}>{item.icon}</div>
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
            <div style={{ fontSize: item.colSpan === 2 ? 18 : 28, fontWeight: 800, color: "#1A1A1A", lineHeight: 1.2 }}>
              {item.title}
            </div>
            <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: "#6B7280" }}>{item.description}</div>
            {item.status && <div style={{ marginTop: 8, fontSize: 12, color: "#9CA3AF" }}>{item.status}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
