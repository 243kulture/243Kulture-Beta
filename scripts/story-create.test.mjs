import assert from "node:assert/strict";
import {
  DEFAULT_STORY_DRAFT_TYPE,
  cameraErrorKey,
  createStoryDraftReset,
  stopMediaStream,
} from "../src/lib/storyCreate.js";

assert.equal(DEFAULT_STORY_DRAFT_TYPE, "image", "Story create must default to photo/camera, not text");

const reset = createStoryDraftReset(["#C8443C", "#1E5FA8"]);
assert.equal(reset.draftType, "image");
assert.equal(reset.draftText, "");
assert.equal(reset.draftMedia, null);
assert.equal(reset.draftFile, null);
assert.ok(["#C8443C", "#1E5FA8"].includes(reset.draftColor));

assert.equal(cameraErrorKey({ name: "NotAllowedError" }), "story_camera_denied");
assert.equal(cameraErrorKey({ name: "NotFoundError" }), "story_camera_nofound");
assert.equal(cameraErrorKey({ name: "Other" }), "story_camera_unavailable");

let stopped = 0;
const fakeStream = {
  getTracks: () => [
    { stop: () => { stopped += 1; } },
    { stop: () => { stopped += 1; } },
  ],
};
assert.equal(stopMediaStream(fakeStream), 2);
assert.equal(stopped, 2);
assert.equal(stopMediaStream(null), 0);

console.log("story-create.test.mjs: PASS");
