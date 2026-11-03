import assert from "node:assert/strict";
import {
  canFollow,
  filterSubscriptionFeed,
  friendRelation,
  isFollowing,
  isSelf,
  mergeProfileMap,
  notificationIcon,
} from "../src/lib/socialRules.js";

const A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-cccc-cccc-cccccccccccc";

// Follow rules
assert.equal(canFollow(A, B), true);
assert.equal(canFollow(A, A), false);
assert.equal(canFollow(null, B), false);
assert.equal(isSelf(A, A), true);
assert.equal(isFollowing([B, C], B), true);
assert.equal(isFollowing([B], A), false);

// Friend preserved as separate from follow
assert.equal(friendRelation([B], [], [], B, A), "friends");
assert.equal(friendRelation([], [{ sender_id: B }], [], B, A), "incoming");
assert.equal(friendRelation([], [], [{ recipient_id: B }], B, A), "outgoing");
assert.equal(friendRelation([], [], [], B, A), "none");
// Being friends does not require following
assert.equal(isFollowing([], B), false);
assert.equal(friendRelation([B], [], [], B, A), "friends");

// Public profile helpers
const map = mergeProfileMap({}, [{ id: A, display_name: "Ada" }, { id: B, display_name: "Bob" }]);
assert.equal(map[A].display_name, "Ada");
assert.equal(mergeProfileMap(map, [{ id: A, creator_type: "artist" }])[A].creator_type, "artist");

// Feed Abonnements
const posts = [
  { id: "1", authorId: A, text: "mine" },
  { id: "2", authorId: B, text: "followed" },
  { id: "3", authorId: C, text: "other" },
  { id: "4", text: "legacy mock without authorId" },
];
const sub = filterSubscriptionFeed(posts, [B], A);
assert.deepEqual(sub.map((p) => p.id), ["1", "2"]);

// Notifications icons
assert.equal(notificationIcon("user_follow"), "👀");
assert.equal(notificationIcon("friend_invite"), "🤝");
assert.equal(notificationIcon("post_comment"), "💬");

console.log("social-rules.test.mjs: PASS");
