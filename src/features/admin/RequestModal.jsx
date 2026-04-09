import { Minus, X } from "lucide-react";

import { C } from "../../caredrop/theme";

export function RequestModal({
  open,
  onClose,
  onDiscard,
  requestType,
  setRequestType,
  requestName,
  setRequestName,
  requestMessage,
  setRequestMessage,
  onSubmit,
  requestHistory,
  requestStatus,
  requestLoading,
  requestConfigured,
}) {
  if (!open) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(26, 26, 26, 0.36)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 18,
        zIndex: 120,
      }}
    >
      <div
        style={{
          width: "min(560px, 100%)",
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 22,
          boxShadow: "0 20px 50px rgba(15, 23, 42, 0.18)",
          padding: 22,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Report or Request</div>
            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginTop: 4 }}>
              Send a bug report, topic request, or fix request. When the feedback inbox is configured, this goes to your central GitHub-backed request inbox.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              type="button"
              onClick={onClose}
              title="Minimize"
              style={{
                width: 36,
                height: 36,
                border: `1px solid ${C.border}`,
                background: C.surface,
                borderRadius: 10,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: C.muted,
              }}
            >
              <Minus size={16} />
            </button>
            <button
              type="button"
              onClick={onDiscard}
              title="Discard and close"
              style={{
                width: 36,
                height: 36,
                border: `1px solid ${C.border}`,
                background: C.surface,
                borderRadius: 10,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: C.muted,
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: C.muted, fontWeight: 700, display: "block", marginBottom: 6 }}>
              Request Type
            </label>
            <select
              value={requestType}
              onChange={(event) => setRequestType(event.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 12,
                border: `1px solid ${C.border}`,
                background: "#FBFAF7",
                fontSize: 13,
                outline: "none",
              }}
            >
              {["Bug Report", "Topic Request", "Feature Request", "Content Fix", "General Feedback"].map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: C.muted, fontWeight: 700, display: "block", marginBottom: 6 }}>
              Name
            </label>
            <input
              value={requestName}
              onChange={(event) => setRequestName(event.target.value)}
              placeholder="Optional name"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 12,
                border: `1px solid ${C.border}`,
                background: "#FBFAF7",
                fontSize: 13,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
        </div>

        <div>
          <label style={{ fontSize: 12, color: C.muted, fontWeight: 700, display: "block", marginBottom: 6 }}>
            Message
          </label>
          <textarea
            value={requestMessage}
            onChange={(event) => setRequestMessage(event.target.value)}
            placeholder="Describe what should be added, fixed, or improved..."
            style={{
              width: "100%",
              minHeight: 130,
              padding: "12px 14px",
              borderRadius: 14,
              border: `1px solid ${C.border}`,
              background: "#FBFAF7",
              fontSize: 14,
              lineHeight: 1.65,
              resize: "vertical",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {requestStatus ? (
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              background: requestConfigured ? C.accentLight : C.amberLight,
              border: `1px solid ${requestConfigured ? C.accentMid : C.amber}`,
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            {requestStatus}
          </div>
        ) : null}

        <div
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            background: requestConfigured ? C.accentLight : C.pill,
            border: `1px solid ${requestConfigured ? C.accentMid : C.border}`,
            fontSize: 12,
            color: requestConfigured ? C.accent : C.muted,
          }}
        >
          {requestConfigured
            ? "Central inbox is active. New requests are being sent to the site handler."
            : "Central inbox is not configured yet. Requests will fall back to local device storage until the GitHub feedback token is added."}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 12, color: C.muted }}>
            Recent requests saved here: <strong>{requestHistory.length}</strong>
          </div>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!requestMessage.trim() || requestLoading}
            style={{
              padding: "10px 16px",
              borderRadius: 12,
              border: "none",
              background: requestMessage.trim() && !requestLoading ? C.accent : C.border,
              color: requestMessage.trim() && !requestLoading ? "#fff" : C.muted,
              fontWeight: 700,
              cursor: requestMessage.trim() && !requestLoading ? "pointer" : "not-allowed",
            }}
          >
            {requestLoading ? "Submitting..." : "Submit Request"}
          </button>
        </div>

        {requestHistory.length ? (
          <div
            style={{
              borderTop: `1px solid ${C.border}`,
              paddingTop: 14,
              display: "grid",
              gap: 10,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 800, color: C.muted }}>Recent Request History</div>
            {requestHistory.slice(0, 3).map((entry) => (
              <div
                key={entry.id}
                style={{
                  border: `1px solid ${C.border}`,
                  background: "#FBFAF7",
                  borderRadius: 14,
                  padding: 12,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{entry.type}</div>
                  <div style={{ fontSize: 11, color: C.faint }}>{new Date(entry.createdAt).toLocaleString()}</div>
                </div>
                {entry.url ? (
                  <div style={{ fontSize: 11, color: C.accent, marginBottom: 6 }}>
                    <a href={entry.url} target="_blank" rel="noreferrer" style={{ color: C.accent }}>
                      Open request #{entry.number}
                    </a>
                  </div>
                ) : null}
                <div style={{ fontSize: 12, color: C.text, lineHeight: 1.6 }}>{entry.message}</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
