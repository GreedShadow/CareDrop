const LIGHT_THEME = {
  mode: "light",
  bg: "#EEF4F0",
  bgElevated: "#F8FBF9",
  surface: "#FFFFFF",
  surfaceMuted: "#FBFAF7",
  surfaceRaised: "#FCFBF8",
  border: "#D9E5DE",
  borderStrong: "#C7D3CD",
  accent: "#0E6B47",
  accentLight: "#E5F5EE",
  accentMid: "#31A56F",
  red: "#C1121F",
  redLight: "#FCECEA",
  amber: "#E76F00",
  amberLight: "#FFF3E0",
  blue: "#2558C8",
  blueLight: "#EAF0FF",
  text: "#182126",
  muted: "#66757F",
  faint: "#91A09A",
  pill: "#EDF3EF",
  panelNeutral: "#F6FAF7",
  panelNeutralDark: "#C9D9D0",
  panelNeutralAlt: "#FCFEFD",
  appGradient: "linear-gradient(180deg, #EDF4EF 0%, #F8FBF9 100%)",
  navGradient: "linear-gradient(90deg, #0A5A39 0%, #0E6B47 52%, #127A52 100%)",
  navText: "#FFFFFF",
  navSubtle: "rgba(230,243,236,0.72)",
  navPillBg: "rgba(255,255,255,0.08)",
  navPillBorder: "1px solid rgba(255,255,255,0.12)",
  navPillText: "#EAF6EF",
  navActionBg: "rgba(255,255,255,0.04)",
  shellShadow: "0 10px 22px rgba(15, 23, 42, 0.04)",
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
  navGradient: "linear-gradient(90deg, #0b1220 0%, #111827 52%, #162033 100%)",
  navText: "#F5FFFA",
  navSubtle: "rgba(203,213,225,0.72)",
  navPillBg: "rgba(148,163,184,0.08)",
  navPillBorder: "1px solid rgba(148,163,184,0.18)",
  navPillText: "#e2e8f0",
  navActionBg: "rgba(148,163,184,0.06)",
  shellShadow: "0 10px 24px rgba(2, 6, 23, 0.24)",
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
