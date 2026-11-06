/**
 * Story create entry defaults — kept pure for unit tests.
 * Camera / photo is the primary modern entry; text remains secondary.
 */
export const DEFAULT_STORY_DRAFT_TYPE = "image";

/** Hard cap for Story video recording (seconds). */
export const STORY_VIDEO_MAX_SECONDS = 30;

/**
 * No daily / count quota on Story posts.
 * Users may publish as many Stories as they want; only the 24h TTL applies.
 * Do not reintroduce soft caps in UI or publishStory.
 */
export const STORY_COUNT_UNLIMITED = true;

/** Portrait Story target: sharp on GSM, not 4K/8K "max at all costs". */
export const STORY_CAPTURE = {
  /** Ideal short×long for phone Stories (720p portrait). */
  idealWidth: 720,
  idealHeight: 1280,
  /** Hard cap — never ask the device for more than FHD portrait. */
  maxWidth: 1080,
  maxHeight: 1920,
  /** Prefer 30fps; avoid high-fps modes that burn battery. */
  idealFrameRate: 30,
  maxFrameRate: 30,
  /** JPEG for stills: sharp enough for 24h Stories, smaller uploads. */
  jpegQuality: 0.84,
  /** Video encode ~2.8 Mbps @ ~720p — stable mid-range Samsung. */
  videoBitsPerSecond: 2_800_000,
  audioBitsPerSecond: 96_000,
};

/**
 * Lightweight CSS filter presets (no AR/ML).
 * Applied on preview via CSS; baked into photo/video canvas when capturing.
 */
export const STORY_FILTERS = [
  { id: "naturel", css: "none", labelKey: "story_filter_naturel" },
  { id: "chaud", css: "contrast(1.06) saturate(1.18) sepia(0.18) brightness(1.03)", labelKey: "story_filter_chaud" },
  { id: "cool", css: "contrast(1.06) saturate(0.92) hue-rotate(18deg) brightness(1.02)", labelKey: "story_filter_cool" },
  { id: "nb", css: "grayscale(1) contrast(1.12) brightness(1.02)", labelKey: "story_filter_nb" },
  { id: "vivid", css: "contrast(1.14) saturate(1.38) brightness(1.04)", labelKey: "story_filter_vivid" },
  { id: "kin", css: "contrast(1.1) saturate(1.22) sepia(0.1) brightness(1.03)", labelKey: "story_filter_kin" },
];

export const DEFAULT_STORY_FILTER_ID = "naturel";

export function getStoryFilter(id) {
  return STORY_FILTERS.find((f) => f.id === id) || STORY_FILTERS[0];
}

export function storyFilterCss(id) {
  return getStoryFilter(id).css || "none";
}

export function createStoryDraftReset(colors = []) {
  const palette = Array.isArray(colors) && colors.length ? colors : ["#C8443C"];
  return {
    draftType: DEFAULT_STORY_DRAFT_TYPE,
    draftText: "",
    draftMedia: null,
    draftFile: null,
    draftColor: palette[Math.floor(Math.random() * palette.length)],
  };
}

/** Stop all MediaStream tracks (safe for unmount / leave screen). */
export function stopMediaStream(stream) {
  if (!stream || typeof stream.getTracks !== "function") return 0;
  let n = 0;
  stream.getTracks().forEach((track) => {
    try { track.stop(); n += 1; } catch { /* ignore */ }
  });
  return n;
}

/** Map getUserMedia error names to i18n keys. */
export function cameraErrorKey(err) {
  const name = err?.name || "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") return "story_camera_denied";
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return "story_camera_nofound";
  return "story_camera_unavailable";
}

/**
 * getUserMedia video constraints tuned for typical GSM Story capture.
 * Prefer 720×1280 ideal; allow up to 1080×1920; never request ultra/4K.
 */
export function storyVideoConstraints(facingMode = "environment") {
  const { idealWidth, idealHeight, maxWidth, maxHeight, idealFrameRate, maxFrameRate } = STORY_CAPTURE;
  return {
    facingMode: { ideal: facingMode },
    width: { ideal: idealWidth, max: maxWidth },
    height: { ideal: idealHeight, max: maxHeight },
    frameRate: { ideal: idealFrameRate, max: maxFrameRate },
  };
}

/**
 * Downscale a frame to Story-friendly max edges while keeping aspect ratio.
 * Returns { width, height, scale }.
 */
export function fitStoryCaptureSize(srcW, srcH, caps = STORY_CAPTURE) {
  const w = Math.max(1, Number(srcW) || 1);
  const h = Math.max(1, Number(srcH) || 1);
  const maxW = caps.maxWidth || 1080;
  const maxH = caps.maxHeight || 1920;
  const scale = Math.min(1, maxW / w, maxH / h);
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
    scale,
  };
}

/** MediaRecorder options with Story-appropriate bitrates when supported. */
export function storyRecorderOptions(mimeType = "") {
  const opts = {
    videoBitsPerSecond: STORY_CAPTURE.videoBitsPerSecond,
    audioBitsPerSecond: STORY_CAPTURE.audioBitsPerSecond,
  };
  if (mimeType) opts.mimeType = mimeType;
  return opts;
}

/** Remaining seconds for UI countdown (clamped). */
export function storyVideoSecondsLeft(elapsedMs, maxSeconds = STORY_VIDEO_MAX_SECONDS) {
  const left = maxSeconds - elapsedMs / 1000;
  return Math.max(0, Math.ceil(left));
}
