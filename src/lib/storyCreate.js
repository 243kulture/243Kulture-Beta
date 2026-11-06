/**
 * Story create entry defaults — kept pure for unit tests.
 * Camera / photo is the primary modern entry; text remains secondary.
 */
export const DEFAULT_STORY_DRAFT_TYPE = "image";

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
