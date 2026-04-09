import { useEffect, useRef, useState } from "react";
import { C } from "./theme";

export function Badge({ label, color = "gray" }) {
  const styles = {
    green: { bg: C.accentLight, text: C.accent },
    red: { bg: C.redLight, text: C.red },
    amber: { bg: C.amberLight, text: C.amber },
    blue: { bg: C.blueLight, text: C.blue },
    gray: { bg: C.pill, text: C.muted },
  };
  const style = styles[color] || styles.gray;

  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.04em",
        padding: "3px 9px",
        borderRadius: 999,
        background: style.bg,
        color: style.text,
        textTransform: "uppercase",
      }}
    >
      {label}
    </span>
  );
}

export function Flashcard({ card, idx, total, onRate }) {
  const [flipped, setFlipped] = useState(false);
  const [flipLocked, setFlipLocked] = useState(false);
  const prevCardId = useRef(card?.id);

  useEffect(() => {
    if (prevCardId.current !== card?.id) {
      setFlipped(false);
      setFlipLocked(false);
      prevCardId.current = card?.id;
    }
  }, [card?.id]);

  if (!card) {
    return null;
  }

  const diffColor =
    card.difficulty === "hard" ? "red" : card.difficulty === "medium" ? "amber" : "green";

  function handleFlip() {
    if (flipLocked) {
      return;
    }

    setFlipLocked(true);
    setFlipped((value) => !value);
    window.setTimeout(() => setFlipLocked(false), 420);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            flex: 1,
            height: 4,
            background: C.border,
            borderRadius: 999,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${((idx + 1) / Math.max(total, 1)) * 100}%`,
              height: "100%",
              background: C.accentMid,
              borderRadius: 999,
              transition: "width 0.3s ease",
            }}
          />
        </div>
        <span style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>
          {idx + 1} / {total}
        </span>
      </div>

      <div style={{ perspective: 1400 }}>
        <button
          type="button"
          onClick={handleFlip}
          style={{
            cursor: flipLocked ? "default" : "pointer",
            minHeight: 280,
            width: "100%",
            background: "transparent",
            border: "none",
            padding: 0,
            userSelect: "none",
          }}
        >
          <div
            style={{
              position: "relative",
              minHeight: 280,
              transformStyle: "preserve-3d",
              transition: "transform 0.42s cubic-bezier(0.2, 0.7, 0.2, 1)",
              transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
            }}
          >
            {[
              {
                side: "front",
                heading: "Question",
                body: card.question,
                footer: "Tap to reveal answer",
                background: C.panelNeutralAlt,
                borderColor: C.panelNeutralDark,
                accentColor: "#85796A",
                extra: null,
              },
              {
                side: "back",
                heading: "Answer",
                body: card.answer,
                footer: null,
                background: `linear-gradient(135deg, ${C.panelNeutral} 0%, #fff 100%)`,
                borderColor: "#CFC5B7",
                accentColor: "#6C6255",
                extra: (
                  <div
                    style={{
                      marginTop: 16,
                      padding: 14,
                      borderRadius: 14,
                      background: "#FFFFFF",
                      border: `1.5px solid ${C.panelNeutralDark}`,
                      fontSize: 13,
                      lineHeight: 1.65,
                      color: C.muted,
                    }}
                  >
                    {card.notes}
                  </div>
                ),
              },
            ].map((face) => (
              <div
                key={face.side}
                style={{
                  position: "absolute",
                  inset: 0,
                  minHeight: 280,
                  background: face.background,
                  border: `1.5px solid ${face.borderColor}`,
                  borderRadius: 22,
                  padding: "28px 28px 24px",
                  boxShadow: "0 12px 24px rgba(15, 23, 42, 0.05)",
                  backfaceVisibility: "hidden",
                  transform: face.side === "back" ? "rotateY(180deg)" : "rotateY(0deg)",
                  textAlign: "left",
                }}
              >
                <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                  <Badge label={card.subject} color="blue" />
                  <Badge label={card.topic} color="gray" />
                  <Badge label={card.difficulty} color={diffColor} />
                  {face.side === "back" ? <Badge label="Answer" color="green" /> : null}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: face.accentColor,
                    fontWeight: 700,
                    letterSpacing: "0.07em",
                    textTransform: "uppercase",
                    marginBottom: 10,
                  }}
                >
                  {face.heading}
                </div>
                <div style={{ fontSize: face.side === "front" ? 19 : 15, fontWeight: 700, color: C.text, lineHeight: 1.65 }}>
                  {face.body}
                </div>
                {face.footer ? (
                  <div style={{ marginTop: 20, fontSize: 12, color: C.faint, textAlign: "center" }}>
                    {face.footer}
                  </div>
                ) : null}
                {face.extra}
              </div>
            ))}
          </div>
        </button>
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          opacity: flipped ? 1 : 0,
          transition: "opacity 0.2s ease",
          pointerEvents: flipped ? "auto" : "none",
          flexWrap: "wrap",
        }}
      >
        {[
          { label: "Missed it", key: "again", color: C.red, bg: C.redLight },
          { label: "Unsure", key: "hard", color: C.amber, bg: C.amberLight },
          { label: "Got it", key: "easy", color: C.accent, bg: C.accentLight },
        ].map((button) => (
          <button
            key={button.key}
            onClick={() => onRate(button.key)}
            style={{
              flex: 1,
              minWidth: 120,
              padding: "11px 14px",
              borderRadius: 12,
              border: `1.5px solid ${button.color}`,
              background: button.bg,
              color: button.color,
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {button.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AIPanel({
  apiLoading,
  aiResponse,
  onGenerate,
  onAsk,
  question,
  setQuestion,
  buttonLabel,
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <button
        onClick={onGenerate}
        disabled={apiLoading}
        style={{
          padding: "13px 20px",
          borderRadius: 12,
          background: apiLoading ? C.border : C.accent,
          color: apiLoading ? C.muted : "#fff",
          border: "none",
          fontWeight: 700,
          fontSize: 14,
          cursor: apiLoading ? "not-allowed" : "pointer",
        }}
      >
        {apiLoading ? "Generating..." : buttonLabel}
      </button>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              onAsk();
            }
          }}
          placeholder="Ask Gemini about a nursing concept..."
          style={{
            flex: 1,
            minWidth: 220,
            padding: "10px 14px",
            borderRadius: 10,
            border: `1px solid ${C.border}`,
            background: C.bg,
            fontSize: 13,
            color: C.text,
            outline: "none",
          }}
        />
        <button
          onClick={onAsk}
          disabled={apiLoading || !question.trim()}
          style={{
            padding: "10px 16px",
            borderRadius: 10,
            background: apiLoading || !question.trim() ? C.border : C.accentMid,
            color: apiLoading || !question.trim() ? C.muted : "#fff",
            border: "none",
            fontWeight: 700,
            fontSize: 13,
            cursor: apiLoading || !question.trim() ? "not-allowed" : "pointer",
          }}
        >
          Ask
        </button>
      </div>

      {aiResponse ? (
        <div
          style={{
            background: C.accentLight,
            border: `1px solid ${C.accentMid}`,
            borderRadius: 12,
            padding: "14px 16px",
            fontSize: 13,
            color: C.text,
            lineHeight: 1.7,
            maxHeight: 220,
            overflowY: "auto",
            whiteSpace: "pre-wrap",
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: C.accent,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: 6,
            }}
          >
            Gemini's Response
          </div>
          {aiResponse}
        </div>
      ) : null}
    </div>
  );
}

export function SidebarNavButton({ active, label, hint, onClick, badge }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "12px 14px",
        borderRadius: 14,
        border: active ? "1px solid rgba(88, 130, 193, 0.32)" : "1px solid transparent",
        background: active ? "linear-gradient(135deg, #1F3D73 0%, #122B55 100%)" : "transparent",
        color: active ? "#F8FBFF" : "#465468",
        cursor: "pointer",
        textAlign: "left",
        transition: "background 0.2s ease, color 0.2s ease, border-color 0.2s ease",
      }}
    >
      <div>
        <div style={{ fontSize: 14, fontWeight: 800 }}>{label}</div>
        {hint ? (
          <div style={{ fontSize: 11, color: active ? "rgba(248, 251, 255, 0.72)" : "#95A1B2", marginTop: 3 }}>
            {hint}
          </div>
        ) : null}
      </div>
      {badge ? (
        <span
          style={{
            minWidth: 26,
            height: 26,
            borderRadius: 999,
            padding: "0 8px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: active ? "rgba(255,255,255,0.16)" : "#EEF3FA",
            color: active ? "#FFFFFF" : "#355E8A",
            fontSize: 11,
            fontWeight: 800,
          }}
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
}

export function SubjectTab({ active, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: active ? "1px solid rgba(23, 43, 77, 0.12)" : "1px solid transparent",
        background: active ? "linear-gradient(135deg, #1A2740 0%, #24385E 100%)" : "transparent",
        color: active ? "#FFFFFF" : "#4C5C73",
        borderRadius: 16,
        padding: "12px 16px",
        minWidth: 136,
        cursor: "pointer",
        textAlign: "left",
        transition: "background 0.2s ease, color 0.2s ease, border-color 0.2s ease",
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 800 }}>{label}</div>
    </button>
  );
}

export function HeroMetric({ label, value, helper, accent = "#9AD75B" }) {
  return (
    <div
      style={{
        padding: "0 18px",
        borderLeft: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div style={{ fontSize: 12, color: "rgba(228, 235, 246, 0.62)", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 34, fontWeight: 800, color: "#FFFFFF", letterSpacing: "-0.04em" }}>{value}</div>
      <div style={{ marginTop: 4, fontSize: 12, color: accent }}>{helper}</div>
    </div>
  );
}

export function ProgressRing({ value, label, caption, size = 190 }) {
  const normalized = Math.max(0, Math.min(100, Number(value || 0)));
  const angle = normalized * 3.6;
  const outerSize = size;
  const innerSize = Math.round(size * 0.74);

  return (
    <div
      style={{
        width: outerSize,
        height: outerSize,
        borderRadius: "50%",
        background: `conic-gradient(#5AD67D 0deg ${angle}deg, rgba(255,255,255,0.08) ${angle}deg 360deg)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.03)",
      }}
    >
      <div
        style={{
          width: innerSize,
          height: innerSize,
          borderRadius: "50%",
          background: "linear-gradient(180deg, #172544 0%, #10203C 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "#FFFFFF",
          textAlign: "center",
          padding: 16,
          boxSizing: "border-box",
        }}
      >
        <div style={{ fontSize: size < 170 ? 28 : 34, fontWeight: 800 }}>{normalized}%</div>
        <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(223,232,246,0.72)" }}>
          {label}
        </div>
        <div style={{ marginTop: 8, fontSize: size < 170 ? 10 : 11, color: "rgba(154, 215, 91, 0.9)" }}>{caption}</div>
      </div>
    </div>
  );
}

export function AnalyticsCard({ title, children, footer }) {
  return (
    <div
      style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 22,
        padding: 22,
        boxShadow: "0 14px 30px rgba(16, 30, 59, 0.05)",
        contentVisibility: "auto",
        containIntrinsicSize: "320px",
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>{title}</div>
      {children}
      {footer ? <div style={{ marginTop: 16 }}>{footer}</div> : null}
    </div>
  );
}
