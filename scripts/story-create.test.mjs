import assert from "node:assert/strict";
import {
  DEFAULT_STORY_DRAFT_TYPE,
  STORY_CAPTURE,
  cameraErrorKey,
  createStoryDraftReset,
  fitStoryCaptureSize,
  stopMediaStream,
  storyRecorderOptions,
  storyVideoConstraints,
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

// Device-appropriate quality: ideal ~720p, never ask above FHD portrait
const v = storyVideoConstraints("environment");
assert.equal(v.width.ideal, 720);
assert.equal(v.height.ideal, 1280);
assert.equal(v.width.max, 1080);
assert.equal(v.height.max, 1920);
assert.ok(v.width.max <= 1080, "must not request >1080 short edge");
assert.ok(v.height.max <= 1920, "must not request >1920 long edge");
assert.equal(v.frameRate.max, 30);

const fit = fitStoryCaptureSize(4000, 3000); // "ultra" phone still → capped
assert.ok(fit.width <= 1080);
assert.ok(fit.height <= 1920);
assert.ok(fit.scale < 1);

const same = fitStoryCaptureSize(720, 1280);
assert.equal(same.width, 720);
assert.equal(same.height, 1280);
assert.equal(same.scale, 1);

assert.ok(STORY_CAPTURE.jpegQuality > 0.7 && STORY_CAPTURE.jpegQuality < 0.95);
assert.ok(STORY_CAPTURE.videoBitsPerSecond >= 1_500_000 && STORY_CAPTURE.videoBitsPerSecond <= 4_500_000);

const rec = storyRecorderOptions("video/webm");
assert.equal(rec.mimeType, "video/webm");
assert.equal(rec.videoBitsPerSecond, STORY_CAPTURE.videoBitsPerSecond);

console.log("story-create.test.mjs: PASS");
