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
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? 1024 : window.innerWidth
  );
  const prevCardId = useRef(card?.id);
  const flipTimeoutRef = useRef(null);
  const cardButtonRef = useRef(null);

  useEffect(() => {
    if (prevCardId.current !== card?.id) {
      setFlipped(false);
      setFlipLocked(false);
      if (flipTimeoutRef.current) {
        window.clearTimeout(flipTimeoutRef.current);
        flipTimeoutRef.current = null;
      }
      prevCardId.current = card?.id;
    }
  }, [card?.id]);

  useEffect(() => {
    return () => {
      if (flipTimeoutRef.current) {
        window.clearTimeout(flipTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    let frameId = null;
    function handleResize() {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      frameId = window.requestAnimationFrame(() => {
        setViewportWidth(window.innerWidth);
        frameId = null;
      });
    }

    window.addEventListener("resize", handleResize);
    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  if (!card) {
    return null;
  }

  const isMobile = viewportWidth < 640;
  const diffColor =
    card.difficulty === "hard" ? "red" : card.difficulty === "medium" ? "amber" : "green";

  function handleFlip() {
    if (flipLocked) {
      return;
    }

    setFlipLocked(true);
    setFlipped((value) => !value);
    if (flipTimeoutRef.current) {
      window.clearTimeout(flipTimeoutRef.current);
    }
    flipTimeoutRef.current = window.setTimeout(() => {
      setFlipLocked(false);
      flipTimeoutRef.current = null;
    }, 420);
  }

  useEffect(() => {
    function handleSpaceFlip(event) {
      if (!(event.key === " " || event.code === "Space")) {
        return;
      }

      const activeElement = document.activeElement;
      const activeTag = activeElement?.tagName;
      const isTypingField =
        activeElement?.isContentEditable ||
        activeTag === "INPUT" ||
        activeTag === "TEXTAREA" ||
        activeTag === "SELECT";
      const isAnotherButtonFocused =
        activeTag === "BUTTON" && activeElement !== cardButtonRef.current;

      if (isTypingField || isAnotherButtonFocused) {
        return;
      }

      event.preventDefault();
      handleFlip();
    }

    window.addEventListener("keydown", handleSpaceFlip);
    return () => window.removeEventListener("keydown", handleSpaceFlip);
  }, [card?.id, flipLocked]);

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
          ref={cardButtonRef}
          type="button"
          onClick={handleFlip}
          onKeyDown={(event) => {
            if (event.key === " " || event.code === "Space") {
              event.preventDefault();
              handleFlip();
            }
          }}
          style={{
            cursor: flipLocked ? "default" : "pointer",
            minHeight: isMobile ? "auto" : "clamp(240px, 42vw, 280px)",
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
              minHeight: isMobile ? "auto" : "clamp(240px, 42vw, 280px)",
              transformStyle: isMobile ? "flat" : "preserve-3d",
              transition: isMobile ? "opacity 0.18s ease" : "transform 0.42s cubic-bezier(0.2, 0.7, 0.2, 1)",
              transform: isMobile ? "none" : flipped ? "rotateY(180deg)" : "rotateY(0deg)",
            }}
          >
            {[
              {
                side: "front",
                heading: "Question",
                body: card.question,
                footer: "Tap or press Space to flip the card",
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
                  position: isMobile ? "relative" : "absolute",
                  inset: isMobile ? "auto" : 0,
                  minHeight: isMobile ? "auto" : "clamp(240px, 42vw, 280px)",
                  background: face.background,
                  border: `1.5px solid ${face.borderColor}`,
                  borderRadius: 22,
                  padding: isMobile ? "18px 18px 16px" : "22px 22px 20px",
                  boxShadow: "0 12px 24px rgba(15, 23, 42, 0.05)",
                  backfaceVisibility: isMobile ? "visible" : "hidden",
                  transform: isMobile ? "none" : face.side === "back" ? "rotateY(180deg)" : "rotateY(0deg)",
                  textAlign: "left",
                  display: isMobile
                    ? flipped === (face.side === "back")
                      ? "block"
                      : "none"
                    : "block",
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
                <div
                  style={{
                    fontSize: face.side === "front" ? "clamp(17px, 2.6vw, 21px)" : "clamp(14px, 2.2vw, 15px)",
                    fontWeight: face.side === "front" ? 800 : 600,
                    color: C.text,
                    lineHeight: face.side === "front" ? 1.55 : 1.7,
                  }}
                >
                  {face.body}
                </div>
                {face.footer ? (
                  <div style={{ marginTop: 18, fontSize: 12, color: C.faint, textAlign: "center" }}>
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
          marginTop: 4,
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
              flex: isMobile ? "1 1 100%" : 1,
              minWidth: isMobile ? "100%" : 120,
              padding: isMobile ? "12px 14px" : "11px 14px",
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
        border: active ? "1px solid rgba(133, 244, 187, 0.22)" : "1px solid rgba(255,255,255,0.06)",
        background: active ? "linear-gradient(135deg, rgba(19,122,78,0.95) 0%, rgba(10,89,56,0.95) 100%)" : "rgba(255,255,255,0.03)",
        color: active ? "#F8FFF9" : "rgba(232, 244, 238, 0.88)",
        cursor: "pointer",
        textAlign: "left",
        transition: "background 0.2s ease, color 0.2s ease, border-color 0.2s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span
          style={{
            width: 10,
            height: 10,
            marginTop: 5,
            borderRadius: 999,
            flexShrink: 0,
            background: active ? "#8AF0B2" : "rgba(255,255,255,0.3)",
            boxShadow: active ? "0 0 0 4px rgba(138,240,178,0.12)" : "none",
          }}
        />
        <div>
        <div style={{ fontSize: 14, fontWeight: 800 }}>{label}</div>
        {hint ? (
          <div style={{ fontSize: 11, color: active ? "rgba(248, 255, 249, 0.72)" : "rgba(219, 234, 226, 0.58)", marginTop: 3 }}>
            {hint}
          </div>
        ) : null}
        </div>
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
            background: active ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.08)",
            color: active ? "#FFFFFF" : "#DDF5E5",
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
        border: active ? "1px solid rgba(14, 107, 71, 0.18)" : "1px solid #DCE8E1",
        background: active ? "linear-gradient(135deg, #0E6B47 0%, #145F46 100%)" : "#FFFFFF",
        color: active ? "#FFFFFF" : "#3F514A",
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
        padding: "18px 18px 16px",
        borderRadius: 20,
        borderTop: `3px solid ${accent}`,
        background: "#FFFFFF",
        border: "1px solid #DCE8E1",
        boxShadow: "0 10px 24px rgba(8, 35, 23, 0.05)",
      }}
    >
      <div style={{ fontSize: 12, color: "#8A9A92", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>{label}</div>
      <div style={{ fontSize: 36, fontWeight: 900, color: "#13221A", letterSpacing: "-0.05em" }}>{value}</div>
      <div style={{ marginTop: 6, fontSize: 12, color: accent, fontWeight: 700 }}>{helper}</div>
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
        background: `conic-gradient(#29B06E 0deg ${angle}deg, #D8E7DF ${angle}deg 360deg)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "inset 0 0 0 1px rgba(19, 34, 26, 0.04)",
      }}
    >
      <div
        style={{
          width: innerSize,
          height: innerSize,
          borderRadius: "50%",
          background: "linear-gradient(180deg, #FDFEFD 0%, #F2F8F5 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "#15251C",
          textAlign: "center",
          padding: 16,
          boxSizing: "border-box",
        }}
      >
        <div style={{ fontSize: size < 170 ? 28 : 34, fontWeight: 800 }}>{normalized}%</div>
        <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#86968E" }}>
          {label}
        </div>
        <div style={{ marginTop: 8, fontSize: size < 170 ? 10 : 11, color: "#148354", fontWeight: 700 }}>{caption}</div>
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
