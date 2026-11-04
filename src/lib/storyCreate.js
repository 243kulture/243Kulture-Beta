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
