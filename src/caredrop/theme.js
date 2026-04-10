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
  bg: "#0C1413",
  bgElevated: "#101A18",
  surface: "#14201D",
  surfaceMuted: "#172623",
  surfaceRaised: "#182925",
  border: "#233934",
  borderStrong: "#2B4740",
  accent: "#49C186",
  accentLight: "#163327",
  accentMid: "#74D7A2",
  red: "#F07178",
  redLight: "#321A1D",
  amber: "#F6B15E",
  amberLight: "#342818",
  blue: "#7DAAFF",
  blueLight: "#17253B",
  text: "#EFF8F3",
  muted: "#A6BBB1",
  faint: "#7F978D",
  pill: "#1A2A26",
  panelNeutral: "#172622",
  panelNeutralDark: "#355047",
  panelNeutralAlt: "#13211E",
  appGradient: "linear-gradient(180deg, #0A1210 0%, #101A18 100%)",
  navGradient: "linear-gradient(90deg, #050908 0%, #0E1715 52%, #13201C 100%)",
  navText: "#F5FFFA",
  navSubtle: "rgba(218,239,229,0.72)",
  navPillBg: "rgba(255,255,255,0.06)",
  navPillBorder: "1px solid rgba(255,255,255,0.08)",
  navPillText: "#DDF7EA",
  navActionBg: "rgba(255,255,255,0.03)",
  shellShadow: "0 18px 36px rgba(0, 0, 0, 0.28)",
  modalOverlay: "rgba(2, 6, 5, 0.72)",
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
