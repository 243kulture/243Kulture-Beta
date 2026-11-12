/**
 * Offline lite — cache last community feed + queue short offline notes.
 * localStorage only; never blocks the online path. Web undegraded.
 */

export const FEED_CACHE_KEY = "kulture243_feed_cache_v1";
export const OFFLINE_NOTE_QUEUE_KEY = "kulture243_offline_notes_v1";

export const OFFLINE_LITE_CAPS = {
  maxFeedPosts: 40,
  maxQueuedNotes: 20,
  maxNoteChars: 500,
};

function defaultStorage() {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

function slimPost(p) {
  if (!p || typeof p !== "object") return { id: null, text: "" };
  return {
    id: p.id ?? null,
    text: typeof p.text === "string" ? p.text.slice(0, 400) : "",
    author_id: p.author_id ?? p.user_id ?? null,
    author_name: p.author_name ?? p.display_name ?? null,
    created_at: p.created_at ?? null,
    offline_cached: true,
  };
}

function persistNoteQueue(list, storage) {
  try {
    storage?.setItem?.(OFFLINE_NOTE_QUEUE_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

/** Best-effort online check (SSR / private mode safe). */
export function isProbablyOffline(
  nav = typeof navigator !== "undefined" ? navigator : null,
) {
  if (!nav || typeof nav.onLine !== "boolean") return false;
  return nav.onLine === false;
}

/**
 * Persist a slim copy of the last feed for offline reading.
 * Strips heavy fields; keeps id/text/author basics.
 */
export function cacheFeed(posts, storage = defaultStorage(), caps = OFFLINE_LITE_CAPS) {
  const list = Array.isArray(posts) ? posts : [];
  const slim = list.slice(0, caps.maxFeedPosts).map(slimPost);
  const payload = { savedAtMs: Date.now(), posts: slim };
  try {
    storage?.setItem?.(FEED_CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private */
  }
  return payload;
}

export function readCachedFeed(storage = defaultStorage()) {
  try {
    const raw = storage?.getItem?.(FEED_CACHE_KEY);
    if (!raw) return { savedAtMs: null, posts: [] };
    const parsed = JSON.parse(raw);
    const posts = Array.isArray(parsed?.posts) ? parsed.posts : [];
    return {
      savedAtMs: typeof parsed?.savedAtMs === "number" ? parsed.savedAtMs : null,
      posts,
    };
  } catch {
    return { savedAtMs: null, posts: [] };
  }
}

export function clearCachedFeed(storage = defaultStorage()) {
  try {
    storage?.removeItem?.(FEED_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Queue a short note composed while offline (flush later when online).
 * @returns {{ ok: boolean, reason?: string, queue?: array, entry?: object }}
 */
export function enqueueOfflineNote(note, storage = defaultStorage(), caps = OFFLINE_LITE_CAPS, nowMs = Date.now()) {
  const text = typeof note === "string" ? note.trim() : String(note?.text || "").trim();
  if (!text) return { ok: false, reason: "empty" };
  if (text.length > caps.maxNoteChars) return { ok: false, reason: "too_long" };

  const current = readOfflineNoteQueue(storage);
  if (current.length >= caps.maxQueuedNotes) {
    return { ok: false, reason: "queue_full", queue: current };
  }

  const entry = {
    id: `off_${nowMs}_${Math.random().toString(36).slice(2, 8)}`,
    text,
    createdAtMs: nowMs,
  };
  const next = [...current, entry];
  persistNoteQueue(next, storage);
  return { ok: true, queue: next, entry };
}

export function readOfflineNoteQueue(storage = defaultStorage()) {
  try {
    const raw = storage?.getItem?.(OFFLINE_NOTE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearOfflineNoteQueue(storage = defaultStorage()) {
  persistNoteQueue([], storage);
}

export function dequeueOfflineNotes(storage = defaultStorage()) {
  const list = readOfflineNoteQueue(storage);
  clearOfflineNoteQueue(storage);
  return list;
}
