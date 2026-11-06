/**
 * Capacitor platform bridge — native-only helpers.
 * Web / PWA path must remain fully functional when Capacitor is absent.
 *
 * Media consent rules (hard):
 * - Camera permission only when the user explicitly starts capture
 * - Gallery: prefer system media picker (no full-library access)
 * - Denied → app stays usable (gallery / text / browse)
 * - Never enable camera or read media in the background
 * - Never publish without explicit user confirmation (UI Publier)
 */
import { Capacitor } from "@capacitor/core";

export const MEDIA_CONSENT = {
  cameraWhy: "243Kulture a besoin de la caméra uniquement pour prendre une photo ou une vidéo de Story / publication.",
  galleryWhy: "243Kulture ouvre le sélecteur système pour choisir une photo ou une vidéo — pas d’accès permanent à toute la galerie.",
  settingsHint: "Tu peux modifier ces autorisations à tout moment dans Réglages → Applications → 243Kulture → Autorisations.",
};

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

/** Soft status-bar polish on native; no-op on web. Never touches camera/media. */
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

/** Native share sheet when available; falls back to Web Share API. User-initiated only. */
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

/**
 * Open the system photo/video picker (Android Photo Picker / iOS PHPicker).
 * Does not request broad READ_MEDIA / full gallery access when the OS picker is used.
 * Call only from a user gesture (gallery button).
 */
export async function pickMediaFromGallery({ preferVideo = false } = {}) {
  if (!isNativePlatform()) {
    return { ok: false, via: "web-input", reason: "use-file-input" };
  }
  try {
    const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
    const photo = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.Uri,
      source: CameraSource.Photos,
      // Prefer stills; video gallery still uses web <input accept> fallback when needed
      promptLabelHeader: preferVideo ? "Choisir une vidéo" : "Choisir une photo",
      promptLabelPhoto: "Galerie",
      promptLabelPicture: "Galerie",
      promptLabelCancel: "Annuler",
    });
    if (!photo?.webPath) {
      return { ok: false, via: "capacitor-picker", reason: "cancelled" };
    }
    const res = await fetch(photo.webPath);
    const blob = await res.blob();
    const ext = (photo.format || "jpeg").toLowerCase();
    const type = blob.type || (ext === "png" ? "image/png" : "image/jpeg");
    const file = new File([blob], `gallery-${Date.now()}.${ext === "jpeg" ? "jpg" : ext}`, { type });
    return { ok: true, via: "capacitor-picker", file, webPath: photo.webPath };
  } catch (err) {
    const msg = String(err?.message || err || "");
    if (/cancel|dismiss|user/i.test(msg)) {
      return { ok: false, via: "capacitor-picker", reason: "cancelled" };
    }
    if (/permission|denied|access/i.test(msg)) {
      return {
        ok: false,
        via: "capacitor-picker",
        reason: "denied",
        message: `${MEDIA_CONSENT.galleryWhy} ${MEDIA_CONSENT.settingsHint}`,
      };
    }
    // Fall back to web file input — still user-initiated
    return { ok: false, via: "capacitor-picker", reason: "fallback-input", error: msg };
  }
}

/**
 * Check / request camera permission only at capture time.
 * Does not open the camera stream — caller (getUserMedia / Camera) still does that.
 */
export async function ensureCameraPermission() {
  if (!isNativePlatform()) {
    return { ok: true, via: "web", status: "prompt-or-granted" };
  }
  try {
    const { Camera } = await import("@capacitor/camera");
    const current = await Camera.checkPermissions();
    if (current.camera === "granted" || current.camera === "limited") {
      return { ok: true, via: "capacitor", status: current.camera };
    }
    if (current.camera === "denied") {
      return {
        ok: false,
        via: "capacitor",
        status: "denied",
        message: `${MEDIA_CONSENT.cameraWhy} ${MEDIA_CONSENT.settingsHint}`,
      };
    }
    const req = await Camera.requestPermissions({ permissions: ["camera"] });
    if (req.camera === "granted" || req.camera === "limited") {
      return { ok: true, via: "capacitor", status: req.camera };
    }
    return {
      ok: false,
      via: "capacitor",
      status: req.camera || "denied",
      message: `${MEDIA_CONSENT.cameraWhy} ${MEDIA_CONSENT.settingsHint}`,
    };
  } catch (err) {
    // Plugin missing / webview will use getUserMedia prompts instead
    return { ok: true, via: "fallback-getUserMedia", status: "unknown", error: err?.message };
  }
}
