/**
 * Capacitor platform bridge — native-only helpers.
 * Web / PWA path must remain fully functional when Capacitor is absent.
 * Never import this module in a way that breaks SSR-less Vite web builds.
 */
import { Capacitor } from "@capacitor/core";

export function isNativePlatform() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function nativePlatform() {
  try {
    return Capacitor.getPlatform(); // 'ios' | 'android' | 'web'
  } catch {
    return "web";
  }
}

/** Soft status-bar polish on native; no-op on web. */
export async function initNativeShell() {
  if (!isNativePlatform()) return { active: false, platform: "web" };
  const platform = nativePlatform();
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: Style.Dark });
    if (platform === "android") {
      try { await StatusBar.setBackgroundColor({ color: "#08090D" }); } catch { /* older devices */ }
    }
  } catch {
    /* plugin optional at runtime */
  }
  try {
    const { Keyboard } = await import("@capacitor/keyboard");
    await Keyboard.setResizeMode?.({ mode: "body" }).catch?.(() => {});
  } catch { /* optional */ }
  return { active: true, platform };
}

/** Native share sheet when available; falls back to Web Share API / clipboard. */
export async function shareContent({ title, text, url } = {}) {
  const payload = { title: title || "243Kulture", text: text || "", url: url || "" };
  if (isNativePlatform()) {
    try {
      const { Share } = await import("@capacitor/share");
      await Share.share(payload);
      return { ok: true, via: "capacitor" };
    } catch (err) {
      return { ok: false, via: "capacitor", error: err?.message };
    }
  }
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share(payload);
      return { ok: true, via: "web-share" };
    } catch (err) {
      return { ok: false, via: "web-share", error: err?.message };
    }
  }
  return { ok: false, via: "none" };
}
