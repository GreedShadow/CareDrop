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

export function Flashcard({ card, idx, total, rating, onRate }) {
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
  const isTablet = viewportWidth < 1024;
  const useStackedCard = true;
  const cardMinHeight = "auto";
  const facePadding = isMobile ? "16px" : isTablet ? "18px" : "22px 22px 20px";
  const compactNoteLimit = isMobile ? 170 : isTablet ? 220 : 280;
  const diffColor =
    card.difficulty === "hard" ? "red" : card.difficulty === "medium" ? "amber" : "green";

  function trimStudyNote(text, limit = compactNoteLimit) {
    const value = String(text || "").replace(/\s+/g, " ").trim();
    if (value.length <= limit) {
      return value;
    }
    return `${value.slice(0, limit).trim()}...`;
  }

  function cleanStudyNote(text) {
    return String(text || "")
      .replace(/^\s*(Correct Answer Explanation|Key Takeaway|Short Rationale)\s*:\s*/i, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  const answerRationale = cleanStudyNote(card.rationale);
  const answerTakeaway = cleanStudyNote(card.notes);

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
      if (!(event.key === " " || event.key === "Space" || event.key === "Spacebar" || event.code === "Space")) {
        return;
      }

      const activeElement = document.activeElement;
      const activeTag = activeElement?.tagName;
      const isTypingField =
        activeElement?.isContentEditable ||
        activeTag === "INPUT" ||
        activeTag === "TEXTAREA" ||
        activeTag === "SELECT";
      const isCardButtonFocused = activeElement === cardButtonRef.current;
      const isAnotherButtonFocused =
        activeTag === "BUTTON" && activeElement !== cardButtonRef.current;

      if (isTypingField || isCardButtonFocused || isAnotherButtonFocused) {
        return;
      }

      event.preventDefault();
      handleFlip();
    }

    window.addEventListener("keydown", handleSpaceFlip);
    return () => window.removeEventListener("keydown", handleSpaceFlip);
  }, [card?.id, flipLocked]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 12 : 16 }}>
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

      <div style={{ perspective: 1400, width: "100%" }}>
        <button
          ref={cardButtonRef}
          type="button"
          onClick={handleFlip}
          onKeyDown={(event) => {
            if (event.key === " " || event.key === "Space" || event.key === "Spacebar" || event.code === "Space") {
              event.preventDefault();
              event.stopPropagation();
              handleFlip();
            }
          }}
          style={{
            cursor: flipLocked ? "default" : "pointer",
            minHeight: cardMinHeight,
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
              minHeight: cardMinHeight,
              transformStyle: useStackedCard ? "flat" : "preserve-3d",
              transition: useStackedCard ? "opacity 0.18s ease" : "transform 0.42s cubic-bezier(0.2, 0.7, 0.2, 1)",
              transform: useStackedCard ? "none" : flipped ? "rotateY(180deg)" : "rotateY(0deg)",
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
                accentColor: C.faint,
                extra: null,
              },
              {
                side: "back",
                heading: "Answer",
                body: card.answer,
                footer: null,
                background: `linear-gradient(135deg, ${C.panelNeutral} 0%, ${C.surface} 100%)`,
                borderColor: C.panelNeutralDark,
                accentColor: C.muted,
                extra: (
                  <div style={{ marginTop: isMobile ? 12 : 16, display: "grid", gap: isMobile ? 10 : 12 }}>
                    {[
                      { label: "Why it matters", text: trimStudyNote(answerRationale || answerTakeaway) },
                      { label: "Key takeaway", text: trimStudyNote(answerTakeaway || answerRationale) },
                    ]
                      .filter((note) => note.text)
                      .map((note) => (
                      <div
                        key={note.label}
                        style={{
                          padding: isMobile ? 12 : 14,
                          borderRadius: isMobile ? 12 : 14,
                          background: C.surface,
                          border: `1.5px solid ${C.panelNeutralDark}`,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 11,
                            color: C.faint,
                            fontWeight: 700,
                            letterSpacing: "0.07em",
                            textTransform: "uppercase",
                          }}
                        >
                          {note.label}
                        </div>
                        <div
                          style={{
                            marginTop: 8,
                            fontSize: isMobile ? 12.5 : 13,
                            lineHeight: 1.6,
                            color: C.muted,
                            overflowWrap: "anywhere",
                          }}
                        >
                          {note.text}
                        </div>
                      </div>
                    ))}
                  </div>
                ),
              },
            ].map((face) => (
              <div
                key={face.side}
                style={{
                  position: useStackedCard ? "relative" : "absolute",
                  inset: useStackedCard ? "auto" : 0,
                  minHeight: cardMinHeight,
                  background: face.background,
                  border: `1.5px solid ${face.borderColor}`,
                  borderRadius: isMobile ? 18 : 22,
                  padding: facePadding,
                  boxShadow: "0 12px 24px rgba(15, 23, 42, 0.05)",
                  backfaceVisibility: useStackedCard ? "visible" : "hidden",
                  transform: useStackedCard ? "none" : face.side === "back" ? "rotateY(180deg)" : "rotateY(0deg)",
                  textAlign: "left",
                  display: useStackedCard
                    ? flipped === (face.side === "back")
                      ? "block"
                      : "none"
                    : "block",
                }}
              >
                {face.side === "back" ? (
                  <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                    <Badge label={card.subject} color="blue" />
                    <Badge label={card.topic} color="gray" />
                    <Badge label={card.difficulty} color={diffColor} />
                    <Badge label="Answer" color="green" />
                  </div>
                ) : null}
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
                    fontSize: face.side === "front" ? "clamp(16px, 2.6vw, 21px)" : "clamp(14px, 2.1vw, 16px)",
                    fontWeight: face.side === "front" ? 800 : 600,
                    color: C.text,
                    lineHeight: face.side === "front" ? 1.5 : 1.65,
                    overflowWrap: "anywhere",
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
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
          gap: 10,
          opacity: flipped ? 1 : 0,
          transition: "opacity 0.2s ease",
          pointerEvents: flipped ? "auto" : "none",
          marginTop: isMobile ? 0 : 2,
        }}
      >
        {[
          { label: "Missed it", key: "again", color: C.red, bg: C.redLight },
          { label: "Unsure", key: "hard", color: C.amber, bg: C.amberLight },
          { label: "Got it", key: "easy", color: C.accent, bg: C.accentLight },
        ].map((button) => {
          const selected = rating === button.key;
          return (
            <button
              key={button.key}
              onClick={() => onRate(button.key)}
              aria-pressed={selected}
              style={{
                width: "100%",
                padding: isMobile ? "12px 14px" : "11px 14px",
                borderRadius: 12,
                border: `1.5px solid ${button.color}`,
                background: selected ? button.color : button.bg,
                color: selected ? "#fff" : button.color,
                fontWeight: 800,
                fontSize: 13,
                cursor: "pointer",
                boxShadow: selected ? "0 10px 22px rgba(15, 23, 42, 0.16)" : "none",
              }}
            >
              {selected ? `${button.label} saved` : button.label}
            </button>
          );
        })}
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
        borderRadius: 12,
        border: active ? "1px solid rgba(143, 242, 182, 0.28)" : "1px solid rgba(255,255,255,0.07)",
        background: active ? "linear-gradient(135deg, rgba(22,140,88,0.96) 0%, rgba(13,97,59,0.96) 100%)" : "rgba(255,255,255,0.035)",
        color: active ? "#F8FFF9" : "rgba(232, 244, 238, 0.88)",
        cursor: "pointer",
        textAlign: "left",
        transition: "background 0.2s ease, color 0.2s ease, border-color 0.2s ease, transform 0.2s ease",
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
            boxShadow: active ? "0 0 0 5px rgba(138,240,178,0.12)" : "none",
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

export function ThemeToggle({ mode = "light", onToggle, showLabel = false }) {
  const dark = mode === "dark";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: showLabel ? 10 : 0,
        padding: showLabel ? "4px 10px 4px 4px" : 4,
        minWidth: showLabel ? 110 : 72,
        height: 42,
        borderRadius: 999,
        border: `1px solid ${dark ? C.borderStrong : C.border}`,
        background: dark ? C.bgElevated : C.surface,
        color: C.text,
        cursor: "pointer",
        boxShadow: dark ? "none" : "0 10px 18px rgba(15, 23, 42, 0.08)",
        transition: "background 0.22s ease, border-color 0.22s ease, box-shadow 0.22s ease",
      }}
    >
      <span
        style={{
          width: 34,
          height: 34,
          borderRadius: "50%",
          background: dark ? C.text : "#0F1110",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
          transition: "transform 0.22s ease, background 0.22s ease",
          transform: dark ? "translateX(0)" : "translateX(0)",
          boxShadow: dark ? "0 0 0 1px rgba(15, 23, 42, 0.08)" : "0 0 0 1px rgba(255,255,255,0.06)",
        }}
      >
        {dark ? (
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
            <path
              d="M14.88 5.01c-1.4.2-2.78.95-3.84 2.05a6.87 6.87 0 0 0-1.95 4.95c.07 1.5.65 2.96 1.67 4.13-3.7-.15-6.73-3.15-6.9-6.95A7.17 7.17 0 0 1 11.03 2c1.53 0 2.98.47 4.2 1.35.18.13.1.41-.13.44-.08.01-.15.02-.22.03Z"
              fill="#060807"
            />
            <path d="m14.9 6.1.64 1.49 1.48.63-1.48.64-.64 1.48-.63-1.48-1.49-.64 1.49-.63.63-1.49Z" fill="#060807" />
            <path d="m17.79 10.91.48 1.1 1.1.47-1.1.48-.48 1.1-.47-1.1-1.1-.48 1.1-.47.47-1.1Z" fill="#060807" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="4.2" fill="#FFFFFF" />
            <path d="M11 2.4v2.2M11 17.4v2.2M19.6 11h-2.2M4.6 11H2.4M17.1 4.9l-1.55 1.55M6.45 15.55 4.9 17.1M17.1 17.1l-1.55-1.55M6.45 6.45 4.9 4.9" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        )}
      </span>
      {showLabel ? (
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase" }}>
          {dark ? "Dark" : "Light"}
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
        border: active ? `1px solid ${C.accentMid}` : `1px solid ${C.border}`,
        background: active ? `linear-gradient(135deg, ${C.accent} 0%, ${C.accentMid} 100%)` : C.surface,
        color: active ? "#FFFFFF" : C.text,
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
        borderRadius: 18,
        background: C.surface,
        border: `1px solid ${C.border}`,
        boxShadow: C.mode === "dark" ? "none" : "0 12px 24px rgba(15, 23, 42, 0.05)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
        <div style={{ fontSize: 12, color: C.faint, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>{label}</div>
        <span
          style={{
            width: 12,
            height: 12,
            borderRadius: 999,
            background: accent,
            boxShadow: `0 0 0 6px ${C.mode === "dark" ? C.pill : `${accent}1F`}`,
            flexShrink: 0,
          }}
        />
      </div>
      <div style={{ fontSize: 36, fontWeight: 900, color: C.text, letterSpacing: "-0.05em" }}>{value}</div>
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
        background: `conic-gradient(${C.accent} 0deg ${angle}deg, ${C.border} ${angle}deg 360deg)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: C.mode === "dark" ? "none" : "inset 0 0 0 1px rgba(19, 34, 26, 0.04)",
      }}
    >
      <div
        style={{
          width: innerSize,
          height: innerSize,
          borderRadius: "50%",
          background: C.mode === "dark" ? `linear-gradient(180deg, ${C.bgElevated} 0%, ${C.surface} 100%)` : "linear-gradient(180deg, #FDFEFD 0%, #F2F8F5 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: C.text,
          textAlign: "center",
          padding: 16,
          boxSizing: "border-box",
        }}
      >
        <div style={{ fontSize: size < 170 ? 28 : 34, fontWeight: 800 }}>{normalized}%</div>
        <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: C.faint }}>
          {label}
        </div>
        <div style={{ marginTop: 8, fontSize: size < 170 ? 10 : 11, color: C.accent, fontWeight: 700 }}>{caption}</div>
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
        borderRadius: 20,
        padding: 22,
        boxShadow: C.mode === "dark" ? "none" : "0 16px 30px rgba(15, 23, 42, 0.05)",
        contentVisibility: "auto",
        containIntrinsicSize: "320px",
      }}
    >
      {title ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: C.accent,
              boxShadow: `0 0 0 6px ${C.mode === "dark" ? C.pill : "#E7F5EE"}`,
              flexShrink: 0,
            }}
          />
          <div style={{ fontSize: 18, fontWeight: 800 }}>{title}</div>
        </div>
      ) : null}
      {children}
      {footer ? <div style={{ marginTop: 16 }}>{footer}</div> : null}
    </div>
  );
}
