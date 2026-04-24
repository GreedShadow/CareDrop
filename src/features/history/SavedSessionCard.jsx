import { Badge } from "../../caredrop/components";
import { C } from "../../caredrop/theme";

export function SavedSessionCard({ session, onOpen, onDelete, buildSessionLabel }) {
  const itemCount = session.questions?.length || session.cards?.length || 0;

  return (
    <div
      style={{
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        padding: 14,
        background: C.surfaceMuted,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{buildSessionLabel(session)}</div>
          <div style={{ fontSize: 12, color: C.muted }}>
            {new Date(session.createdAt).toLocaleString()}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {session.saved ? <Badge label="saved" color="green" /> : null}
          <Badge label={`${itemCount} items`} color="blue" />
        </div>
      </div>
      <div style={{ fontSize: 12, color: C.muted }}>{session.sourceLabel}</div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: C.muted }}>
        <div>Score: <strong>{session.score ?? 0}%</strong></div>
        <div>Answered: <strong>{session.answeredCount ?? 0}</strong></div>
        <div>Difficulty: <strong>{session.difficulty}</strong></div>
        <div>Mode: <strong>{session.mode}</strong></div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          onClick={() => onOpen(session)}
          style={{
            padding: "8px 14px",
            borderRadius: 10,
            background: C.accentLight,
            color: C.accent,
            border: `1px solid ${C.accentMid}`,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Review
        </button>
        <button
          onClick={() => onDelete(session.id)}
          style={{
            padding: "8px 14px",
            borderRadius: 10,
            background: C.redLight,
            color: C.red,
            border: `1px solid ${C.red}`,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
