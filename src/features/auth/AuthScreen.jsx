import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { LOGO_SRC } from "../../caredrop/constants";
import { ThemeToggle } from "../../caredrop/components";
import { C } from "../../caredrop/theme";

export function AuthScreen(props) {
  const {
    width,
    authMode,
    setAuthMode,
    authName,
    setAuthName,
    authEmail,
    setAuthEmail,
    authPassword,
    setAuthPassword,
    authConfirmPassword,
    setAuthConfirmPassword,
    termsAccepted,
    setTermsAccepted,
    onOpenTerms,
    cloudSyncReady,
    authNotice,
    onDismissNotice,
    authError,
    authLoading,
    forgotPasswordLoading,
    onSubmit,
    onForgotPassword,
    themeMode,
    onToggleTheme,
  } = props;
  const isRegister = authMode === "register";
  const stacked = width < 940;
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    setShowPassword(false);
    setShowConfirmPassword(false);
  }, [authMode]);

  function renderPasswordInput({ value, onChange, placeholder, visible, setVisible }) {
    return (
      <div style={{ position: "relative" }}>
        <input value={value} onChange={onChange} placeholder={placeholder} type={visible ? "text" : "password"} style={{ width: "100%", padding: "12px 46px 12px 14px", borderRadius: 14, border: `1px solid ${C.border}`, background: C.surfaceMuted, color: C.text, fontSize: 14, outline: "none", boxSizing: "border-box" }} />
        <button type="button" onClick={() => setVisible((current) => !current)} aria-label={visible ? "Hide password" : "Show password"} style={{ position: "absolute", top: "50%", right: 10, transform: "translateY(-50%)", width: 28, height: 28, borderRadius: 999, border: "none", background: "transparent", color: C.muted, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: C.appGradient, padding: width < 640 ? 16 : 24, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', 'Segoe UI', sans-serif" }}>
      <div style={{ width: "min(1100px, 100%)", display: "grid", gridTemplateColumns: stacked ? "1fr" : "minmax(0, 1.1fr) minmax(340px, 440px)", gap: 20, alignItems: "stretch" }}>
        <div style={{ background: C.navGradient, borderRadius: 28, padding: stacked ? 24 : 34, color: C.navText, minHeight: stacked ? 420 : 560, display: "flex", flexDirection: "column", justifyContent: "space-between", boxShadow: C.shellShadow, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: "auto -60px -70px auto", width: 220, height: 220, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,229,175,0.25) 0%, rgba(139,229,175,0.02) 65%, transparent 70%)" }} />
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: "rgba(255,255,255,0.12)", overflow: "hidden" }}>
                <img src={LOGO_SRC} alt="CareDrop logo" style={{ width: "100%", height: "100%", display: "block" }} />
              </div>
              <div style={{ fontWeight: 800, fontSize: 20 }}>Care<span style={{ color: "#8BE5AF" }}>Drop</span></div>
              </div>
              <ThemeToggle mode={themeMode} onToggle={onToggleTheme} showLabel />
            </div>
            <div style={{ marginTop: 28, fontSize: stacked ? 34 : 46, lineHeight: 1.04, fontWeight: 900, letterSpacing: "-0.05em", maxWidth: 520 }}>Study smarter. Learn from mistakes. Build confidence.</div>
            <div style={{ marginTop: 18, fontSize: 15, lineHeight: 1.85, color: C.navSubtle, maxWidth: 560 }}>Continue your flashcards, quizzes, uploads, weak-area review, and saved sessions in one supportive workspace built for real learners preparing for demanding exams.</div>
          </div>
          <div style={{ fontSize: 13, color: C.navSubtle, lineHeight: 1.7, maxWidth: 520 }}>
            {cloudSyncReady ? "Cloud sync is available, so your progress can follow you across devices once Supabase is connected." : "You can still use CareDrop locally today. Free cloud sync becomes available after Supabase keys are added."}
          </div>
        </div>

        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 28, padding: 28, boxShadow: C.shellShadow, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
            {[["login", "Sign In"], ["register", "Register"]].map(([value, label]) => (
              <button key={value} type="button" onClick={() => setAuthMode(value)} style={{ flex: 1, padding: "12px 14px", borderRadius: 14, border: authMode === value ? `1px solid ${C.borderStrong}` : `1px solid ${C.border}`, background: authMode === value ? C.navGradient : C.surfaceMuted, color: authMode === value ? "#fff" : C.text, fontWeight: 800, cursor: "pointer" }}>{label}</button>
            ))}
          </div>

          <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-0.04em" }}>{isRegister ? "Create your learner account" : "Welcome back"}</div>
          <div style={{ marginTop: 8, fontSize: 14, color: C.muted, lineHeight: 1.7 }}>{isRegister ? "Set up your account to save sessions, track progress, and build a review history you can return to." : "Pick up where you left off and keep your review momentum moving."}</div>

          <div style={{ marginTop: 22, display: "grid", gap: 12 }}>
            {isRegister ? <div><label style={{ fontSize: 12, color: C.muted, fontWeight: 700, display: "block", marginBottom: 6 }}>Name</label><input value={authName} onChange={(event) => setAuthName(event.target.value)} placeholder="Your name" style={{ width: "100%", padding: "12px 14px", borderRadius: 14, border: `1px solid ${C.border}`, background: C.surfaceMuted, color: C.text, fontSize: 14, outline: "none", boxSizing: "border-box" }} /></div> : null}
            <div><label style={{ fontSize: 12, color: C.muted, fontWeight: 700, display: "block", marginBottom: 6 }}>Email</label><input value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="name@example.com" type="email" style={{ width: "100%", padding: "12px 14px", borderRadius: 14, border: `1px solid ${C.border}`, background: C.surfaceMuted, color: C.text, fontSize: 14, outline: "none", boxSizing: "border-box" }} /></div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 6 }}>
                <label style={{ fontSize: 12, color: C.muted, fontWeight: 700, display: "block" }}>Password</label>
                {!isRegister && cloudSyncReady ? <button type="button" onClick={onForgotPassword} disabled={authLoading || forgotPasswordLoading} style={{ border: "none", background: "transparent", padding: 0, color: C.accent, fontSize: 12, fontWeight: 700, cursor: authLoading || forgotPasswordLoading ? "not-allowed" : "pointer" }}>{forgotPasswordLoading ? "Sending reset..." : "Forgot password?"}</button> : null}
              </div>
              {renderPasswordInput({ value: authPassword, onChange: (event) => setAuthPassword(event.target.value), placeholder: "At least 8 characters", visible: showPassword, setVisible: setShowPassword })}
            </div>
            {isRegister ? <div><label style={{ fontSize: 12, color: C.muted, fontWeight: 700, display: "block", marginBottom: 6 }}>Confirm Password</label>{renderPasswordInput({ value: authConfirmPassword, onChange: (event) => setAuthConfirmPassword(event.target.value), placeholder: "Repeat password", visible: showConfirmPassword, setVisible: setShowConfirmPassword })}</div> : null}
          </div>

          {authNotice ? <div style={{ marginTop: 16, padding: "16px 16px 14px", borderRadius: 16, background: C.accentLight, border: `1px solid ${C.accentMid}`, color: C.text }}><div style={{ fontSize: 12, color: C.accent, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>{authNotice.title}</div><div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.7 }}>{authNotice.body}</div><button type="button" onClick={onDismissNotice} style={{ marginTop: 12, padding: "9px 12px", borderRadius: 10, border: `1px solid ${C.accentMid}`, background: C.surface, color: C.accent, fontWeight: 700, cursor: "pointer" }}>{authNotice.actionLabel || "Continue"}</button></div> : null}
          {authError ? <div style={{ marginTop: 16, padding: "11px 13px", borderRadius: 14, background: C.redLight, border: `1px solid ${C.red}`, color: C.text, fontSize: 13, lineHeight: 1.6 }}>{authError}</div> : null}

          <label style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, lineHeight: 1.6, color: C.text }}>
            <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} style={{ marginTop: 2 }} />
            <span>I agree to the <button type="button" onClick={onOpenTerms} style={{ border: "none", background: "transparent", padding: 0, color: C.accent, fontWeight: 800, textDecoration: "underline", cursor: "pointer" }}>Terms and Conditions</button> and understand that CareDrop is a reviewer tool for study support only.</span>
          </label>

          <button type="button" onClick={onSubmit} disabled={authLoading || !termsAccepted} style={{ marginTop: 20, padding: "13px 16px", borderRadius: 14, border: "none", background: authLoading || !termsAccepted ? C.border : C.accent, color: authLoading || !termsAccepted ? C.muted : "#fff", fontWeight: 800, fontSize: 14, cursor: authLoading || !termsAccepted ? "not-allowed" : "pointer" }}>
            {authLoading ? "Working..." : isRegister ? "Create Account" : "Sign In"}
          </button>

          <div style={{ marginTop: 14, fontSize: 12, color: C.muted, lineHeight: 1.7 }}>{cloudSyncReady ? "Signed-in learners can restore progress, saved sessions, and recent study state across devices." : "Cloud sync will activate after you add the free Supabase project keys in the environment settings."}</div>
        </div>
      </div>
    </div>
  );
}
