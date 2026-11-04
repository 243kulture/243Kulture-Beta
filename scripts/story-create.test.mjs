import assert from "node:assert/strict";
import { DEFAULT_STORY_DRAFT_TYPE, createStoryDraftReset } from "../src/lib/storyCreate.js";

assert.equal(DEFAULT_STORY_DRAFT_TYPE, "image", "Story create must default to photo/camera, not text");

const reset = createStoryDraftReset(["#C8443C", "#1E5FA8"]);
assert.equal(reset.draftType, "image");
assert.equal(reset.draftText, "");
assert.equal(reset.draftMedia, null);
assert.equal(reset.draftFile, null);
assert.ok(["#C8443C", "#1E5FA8"].includes(reset.draftColor));

console.log("story-create.test.mjs: PASS");
