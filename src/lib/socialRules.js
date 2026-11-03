/**
 * Pure helpers for the community social layer.
 * Follow is one-way; Friend is reciprocal via invitations.
 */

export function isSelf(viewerId, targetId) {
  return Boolean(viewerId && targetId && viewerId === targetId);
}

export function canFollow(viewerId, targetId) {
  return Boolean(viewerId && targetId && viewerId !== targetId);
}

export function isFollowing(followingIds, targetId) {
  return Array.isArray(followingIds) && followingIds.includes(targetId);
}

/** Filter posts for "Abonnements" feed (followed authors + own posts). */
export function filterSubscriptionFeed(posts, followingIds, viewerId) {
  const allowed = new Set([...(followingIds || []), viewerId].filter(Boolean));
  return (posts || []).filter((p) => p.authorId && allowed.has(p.authorId));
}

/**
 * Filter posts for "Pour toi" discovery (authors you do not follow).
 * Falls back to the full list when discovery would be empty so the mode never looks broken.
 */
export function filterDiscoveryFeed(posts, followingIds, viewerId) {
  const following = new Set(followingIds || []);
  const list = posts || [];
  const discovered = list.filter((p) => {
    if (!p.authorId) return true; // legacy/mock without author → discovery-friendly
    if (viewerId && p.authorId === viewerId) return false;
    return !following.has(p.authorId);
  });
  return discovered.length > 0 ? discovered : list;
}

/** Map notification type → icon glyph. */
export function notificationIcon(type) {
  switch (type) {
    case "friend_invite":
    case "friend_accepted":
      return "🤝";
    case "user_follow":
      return "👀";
    case "post_comment":
      return "💬";
    case "story_reply":
      return "✨";
    case "message":
      return "✉️";
    default:
      return "🔔";
  }
}

/** Friend relation labels used by UI (does not imply follow). */
export function friendRelation(friends, incomingInvites, outgoingInvites, profileId, viewerId) {
  if (!profileId || profileId === viewerId) return "self";
  if ((friends || []).includes(profileId)) return "friends";
  if ((incomingInvites || []).some((i) => i.sender_id === profileId)) return "incoming";
  if ((outgoingInvites || []).some((i) => i.recipient_id === profileId)) return "outgoing";
  return "none";
}

export function mergeProfileMap(existing, profiles) {
  const next = { ...(existing || {}) };
  (profiles || []).forEach((p) => {
    if (p?.id) next[p.id] = { ...(next[p.id] || {}), ...p };
  });
  return next;
}
