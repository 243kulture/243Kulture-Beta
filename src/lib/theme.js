/**
 * 243Kulture appearance preference.
 * Modes: system | dark | light. Default is dark (current Nuit 243 look).
 * Preference is stored in localStorage; resolved palette is applied via
 * document.documentElement[data-theme] (+ CSS media for "system").
 */

export const THEME_STORAGE_KEY = "243kulture_appearance";
export const THEME_MODES = ["system", "dark", "light"];
export const DEFAULT_THEME_MODE = "dark";

export const THEME_META_COLORS = {
  dark: "#0B0D12",
  light: "#F7F4EF",
};

export function isThemeMode(value) {
  return THEME_MODES.includes(value);
}

export function resolveThemeMode(value) {
  return isThemeMode(value) ? value : DEFAULT_THEME_MODE;
}

export function readStoredTheme() {
  try {
    return resolveThemeMode(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME_MODE;
  }
}

export function persistThemeLocal(mode) {
  const next = resolveThemeMode(mode);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    /* ignore quota / private mode */
  }
  return next;
}

/** OS preference used only when stored mode is "system". */
export function getSystemResolvedTheme() {
  try {
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    }
  } catch {
    /* ignore */
  }
  return "dark";
}

export function resolveEffectiveTheme(mode) {
  const stored = resolveThemeMode(mode);
  if (stored === "system") return getSystemResolvedTheme();
  return stored;
}

export function applyThemeToDocument(mode) {
  const stored = resolveThemeMode(mode);
  if (typeof document === "undefined") return stored;
  const root = document.documentElement;
  root.setAttribute("data-theme", stored);
  const effective = resolveEffectiveTheme(stored);
  root.style.colorScheme = effective;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_META_COLORS[effective] || THEME_META_COLORS.dark);
  return stored;
}

/** Boot helper — call before React render to avoid a flash of the wrong theme. */
export function bootTheme() {
  return applyThemeToDocument(readStoredTheme());
}
