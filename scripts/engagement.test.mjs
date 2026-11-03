import assert from "node:assert/strict";
import {
  DAILY_ACTION_DISMISS_KEY,
  DAILY_ACTION_KINDS,
  dismissDailyAction,
  getDailyActionKind,
  isDailyActionDismissed,
  localDayKey,
} from "../src/lib/engagement.js";

assert.deepEqual(DAILY_ACTION_KINDS, ["story", "post", "quiz"]);
assert.match(localDayKey(new Date(2026, 10, 3)), /^\d{4}-\d{2}-\d{2}$/);
assert.equal(localDayKey(new Date(2026, 0, 5)), "2026-01-05");

const k0 = getDailyActionKind(new Date(2026, 10, 3));
const k1 = getDailyActionKind(new Date(2026, 10, 4));
const k2 = getDailyActionKind(new Date(2026, 10, 5));
const k3 = getDailyActionKind(new Date(2026, 10, 6));
assert.ok(DAILY_ACTION_KINDS.includes(k0));
assert.notEqual(k0, k1);
assert.notEqual(k1, k2);
assert.equal(k0, k3); // 3-day cycle

const mem = new Map();
const storage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
};
const day = new Date(2026, 10, 3);
assert.equal(isDailyActionDismissed(day, storage), false);
assert.equal(dismissDailyAction(day, storage), true);
assert.equal(storage.getItem(DAILY_ACTION_DISMISS_KEY), "2026-11-03");
assert.equal(isDailyActionDismissed(day, storage), true);
assert.equal(isDailyActionDismissed(new Date(2026, 10, 4), storage), false);

console.log("engagement.test.mjs: PASS");
