const LIGHT_THEME = {
  mode: "light",
  bg: "#ECF4EF",
  bgElevated: "#F7FBF8",
  surface: "#FFFFFF",
  surfaceMuted: "#F5FAF7",
  surfaceRaised: "#FDFEFD",
  border: "#D8E5DE",
  borderStrong: "#BDD0C6",
  accent: "#0F7A49",
  accentLight: "#E4F6EC",
  accentMid: "#34C47C",
  red: "#C1121F",
  redLight: "#FCECEA",
  amber: "#E76F00",
  amberLight: "#FFF3E0",
  blue: "#2558C8",
  blueLight: "#EAF0FF",
  text: "#182126",
  muted: "#66757F",
  faint: "#91A09A",
  pill: "#EEF5F1",
  panelNeutral: "#F3F8F5",
  panelNeutralDark: "#CBD8D1",
  panelNeutralAlt: "#FBFEFC",
  appGradient: "linear-gradient(180deg, #EAF3EE 0%, #F7FBF8 100%)",
  navGradient: "linear-gradient(90deg, #0B6A41 0%, #0D7849 48%, #0E6F45 100%)",
  navText: "#FFFFFF",
  navSubtle: "rgba(230,243,236,0.72)",
  navPillBg: "rgba(255,255,255,0.09)",
  navPillBorder: "1px solid rgba(255,255,255,0.14)",
  navPillText: "#EAF6EF",
  navActionBg: "rgba(255,255,255,0.04)",
  shellShadow: "0 14px 36px rgba(15, 23, 42, 0.06)",
  modalOverlay: "rgba(26, 26, 26, 0.36)",
};

const DARK_THEME = {
  mode: "dark",
  bg: "#0f172a",
  bgElevated: "#111827",
  surface: "#1e293b",
  surfaceMuted: "#172133",
  surfaceRaised: "#243247",
  border: "#334155",
  borderStrong: "#475569",
  accent: "#34d399",
  accentLight: "#123b32",
  accentMid: "#6ee7b7",
  red: "#F07178",
  redLight: "#3a1f26",
  amber: "#F6B15E",
  amberLight: "#3b2c1a",
  blue: "#7DAAFF",
  blueLight: "#1b2940",
  text: "#e2e8f0",
  muted: "#94a3b8",
  faint: "#64748b",
  pill: "#182334",
  panelNeutral: "#162234",
  panelNeutralDark: "#334155",
  panelNeutralAlt: "#111827",
  appGradient: "linear-gradient(180deg, #0f172a 0%, #111827 100%)",
  navGradient: "linear-gradient(90deg, #0d3f32 0%, #0d4d3c 48%, #0f172a 100%)",
  navText: "#F5FFFA",
  navSubtle: "rgba(203,213,225,0.72)",
  navPillBg: "rgba(148,163,184,0.08)",
  navPillBorder: "1px solid rgba(148,163,184,0.18)",
  navPillText: "#e2e8f0",
  navActionBg: "rgba(148,163,184,0.06)",
  shellShadow: "0 16px 36px rgba(2, 6, 23, 0.28)",
  modalOverlay: "rgba(2, 6, 23, 0.74)",
};

export const C = { ...LIGHT_THEME };

export function applyThemeMode(mode = "light") {
  const nextTheme = mode === "dark" ? DARK_THEME : LIGHT_THEME;
  Object.keys(C).forEach((key) => {
    delete C[key];
  });
  Object.assign(C, nextTheme);

  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = nextTheme.mode;
    document.documentElement.style.colorScheme = nextTheme.mode;
    document.body.style.background = nextTheme.bg;
    document.body.style.color = nextTheme.text;
  }
}

export function getPreferredThemeMode() {
  if (typeof window === "undefined") {
    return "light";
  }

  try {
    const stored = window.localStorage.getItem("caredrop-theme-mode");
    if (stored === "light" || stored === "dark") {
      return stored;
    }
  } catch {
    // ignore storage access failure
  }

  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
}

export function persistThemeMode(mode) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem("caredrop-theme-mode", mode);
  } catch {
    // ignore storage access failure
  }
}
