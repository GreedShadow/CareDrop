import { C } from "../../caredrop/theme";

export function TermsModal({ open, onClose }) {
  if (!open) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: C.modalOverlay,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 18,
        zIndex: 140,
      }}
    >
      <div
        style={{
          width: "min(680px, 100%)",
          maxHeight: "min(86vh, 760px)",
          overflowY: "auto",
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 22,
          boxShadow: C.shellShadow,
          padding: 24,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              CareDrop
            </div>
            <div style={{ marginTop: 6, fontSize: 26, fontWeight: 900, letterSpacing: "-0.04em" }}>
              Terms and Conditions
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 36,
              height: 36,
              borderRadius: 999,
              border: `1px solid ${C.border}`,
              background: C.surfaceMuted,
              color: C.muted,
              cursor: "pointer",
              fontWeight: 800,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ marginTop: 16, display: "grid", gap: 16, fontSize: 14, lineHeight: 1.8, color: C.text }}>
          <div>
            CareDrop is a study-support platform built to help learners review flashcards, quizzes, uploaded notes, and AI explanations more consistently. By creating an account or signing in, you agree to use the platform responsibly and for educational purposes.
          </div>
          <div>
            <strong>1. Educational use only.</strong> CareDrop is for review, recall practice, and learning support. It does not replace licensed medical judgment, formal instruction, clinical supervision, or emergency decision-making.
          </div>
          <div>
            <strong>2. Accuracy and judgment.</strong> We work to make the study experience reliable, but learners are still responsible for cross-checking important academic, medication, and clinical information with trusted references, instructors, and current guidelines.
          </div>
          <div>
            <strong>3. Account responsibility.</strong> You are responsible for the information you enter, the files you upload, and any activity that takes place while signed in on your device or account.
          </div>
          <div>
            <strong>4. Uploaded material.</strong> Only upload notes, documents, and materials you are allowed to use. Do not upload sensitive patient information, protected health information, or content that violates privacy, law, or school policy.
          </div>
          <div>
            <strong>5. AI-assisted responses.</strong> AI explanations and generated review content are intended to support study sessions, not to function as definitive clinical authority. Use them as guided review support, especially when clarifying mistakes and difficult concepts.
          </div>
          <div>
            <strong>6. Progress and saved work.</strong> CareDrop may store study progress, saved sessions, and settings locally or through connected services such as Supabase when configured. This helps restore continuity across sessions and devices.
          </div>
          <div>
            <strong>7. Respectful use.</strong> Do not use CareDrop to submit abusive content, misuse feedback/reporting tools, interfere with the service, or attempt to access information that is not yours.
          </div>
          <div>
            <strong>8. Platform updates.</strong> Features, content, and integrations may improve over time. Continued use of CareDrop means you accept those changes as part of the platform’s evolution.
          </div>
        </div>

        <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "11px 16px",
              borderRadius: 12,
              border: "none",
              background: C.accent,
              color: "#fff",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
