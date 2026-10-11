/**
 * 243Kulture UI i18n — one JSON file per language for native revision.
 * Congolese languages (ln, sw, lua, kg, mongo) may set `_provisional: true`.
 */

import fr from "./fr.json" with { type: "json" };
import en from "./en.json" with { type: "json" };
import nl from "./nl.json" with { type: "json" };
import ln from "./ln.json" with { type: "json" };
import sw from "./sw.json" with { type: "json" };
import lua from "./lua.json" with { type: "json" };
import kg from "./kg.json" with { type: "json" };
import mongo from "./mongo.json" with { type: "json" };

/** Supported UI language codes (ISO-ish). `mongo` is intentional (not ISO 639-1). */
export const SUPPORTED_LANGS = ["en", "fr", "kg", "ln", "mongo", "nl", "sw", "lua"];

/**
 * Display metadata — ALPHA order by native displayed name:
 * English, Français, Kikongo, Lingála, Mongo, Nederlands, Swahili, Tshiluba
 */
export const LANG_META = [
  { code: "en", nativeName: "English", flag: "🇬🇧" },
  { code: "fr", nativeName: "Français", flag: "🇫🇷" },
  { code: "kg", nativeName: "Kikongo", flag: "🇨🇩" },
  { code: "ln", nativeName: "Lingála", flag: "🇨🇩" },
  { code: "mongo", nativeName: "Mongo", flag: "🇨🇩" },
  { code: "nl", nativeName: "Nederlands", flag: "🇳🇱" },
  { code: "sw", nativeName: "Swahili", flag: "🇨🇩" },
  { code: "lua", nativeName: "Tshiluba", flag: "🇨🇩" },
];

export const LANG_LABELS = Object.fromEntries(LANG_META.map((l) => [l.code, l.nativeName]));

export const I18N = { fr, en, nl, ln, sw, lua, kg, mongo };

export const LANG_STORAGE_KEY = "243kulture_lang";
export const TERMS_LOCAL_KEY = "243kulture_cgu_accepted";

/** Current required CGU version — bump to re-prompt all users. */
export const REQUIRED_CGU_VERSION = "v1.0";
export const REQUIRED_PRIVACY_VERSION = "v1.0";

export function isSupportedLang(code) {
  return SUPPORTED_LANGS.includes(code);
}

export function resolveLang(code) {
  if (isSupportedLang(code)) return code;
  return null;
}

export function readStoredLang() {
  try {
    return resolveLang(localStorage.getItem(LANG_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function persistLangLocal(code) {
  const lang = resolveLang(code);
  if (!lang) return false;
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
  return true;
}

export function getUiStrings(lang) {
  const code = resolveLang(lang) || "fr";
  const base = I18N.fr;
  const pack = I18N[code] || base;
  return { ...base, ...pack };
}

export function isProvisionalLang(lang) {
  return Boolean(I18N[lang]?._provisional);
}

/** Content packs that still have only 4 languages fall back here. */
export function contentLang(lang) {
  const code = resolveLang(lang) || "fr";
  if (["fr", "ln", "en", "nl"].includes(code)) return code;
  if (code === "nl") return "nl";
  return "fr";
}
