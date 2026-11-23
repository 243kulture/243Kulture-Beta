import React from "react";
import { MessageCircle, Pencil, Star } from "lucide-react";

/** Deterministic charcoal + gold cover (V2 palette — no photo upload). */
export function profileCoverStyle(seed = "") {
  const s = String(seed || "243");
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const variants = [
    "radial-gradient(ellipse 90% 70% at 18% 0%, rgba(233,185,67,.28) 0%, transparent 55%), linear-gradient(145deg, #171A20 0%, #0B0D10 55%, #12151c 100%)",
    "radial-gradient(ellipse 80% 65% at 85% 8%, rgba(233,185,67,.22) 0%, transparent 50%), linear-gradient(160deg, #0B0D10 0%, #1a1e28 48%, #0B0D10 100%)",
    "radial-gradient(ellipse 70% 60% at 50% 0%, rgba(245,245,245,.08) 0%, transparent 50%), linear-gradient(135deg, #12151c 0%, #0B0D10 40%, #171A20 100%)",
    "radial-gradient(ellipse 85% 75% at 30% 15%, rgba(233,185,67,.18) 0%, transparent 52%), linear-gradient(150deg, #0B0D10 0%, #171A20 60%, #0B0D10 100%)",
  ];
  return { background: variants[h % variants.length] };
}

/**
 * Shared profile header — Motema structure, Premium Editorial V2 colors.
 * Follow ≠ Friend (friend actions stay in belowActions).
 */
export default function ProfileHero({
  profileId,
  displayName,
  avatarIcon = "🎶",
  bio,
  country,
  handle,
  creatorStatus,
  creatorStatusLabel,
  creatorType,
  stats = { posts: 0, followers: 0, following: 0 },
  isSelf = false,
  t = {},
  primaryActions = null,
  secondaryActions = null,
  belowActions = null,
  tab = "publications",
  onTabChange,
  showStoriesTab = false,
  hasActiveStory = false,
  storyUnseen = false,
  onAvatarClick = null,
}) {
  const avatarInteractive = Boolean(hasActiveStory && onAvatarClick);
  return (
    <div className="profile-hero">
      <div className="profile-cover" style={profileCoverStyle(profileId || displayName)} aria-hidden="true" />
      <div className="profile-hero-body">
        <div className="profile-avatar-wrap">
          <button
            type="button"
            className={`profile-avatar-btn${hasActiveStory ? " has-story" : ""}${storyUnseen ? " story-unseen" : ""}${avatarInteractive ? " is-clickable" : ""}`}
            onClick={avatarInteractive ? onAvatarClick : undefined}
            disabled={!avatarInteractive}
            aria-label={avatarInteractive ? (t.profile_open_story || "Voir la Story") : undefined}
          >
            <span className="profile-avatar-lg" aria-hidden="true">{avatarIcon || "🎶"}</span>
          </button>
        </div>
        <div className="profile-identity">
          <div className="profile-name-row">
            <h1 className="profile-name-lg">{displayName || t.profile_fan || "243Kulture"}</h1>
            {creatorStatus && creatorStatus !== "member" && (
              <span className="profile-verified" title={creatorStatusLabel}>
                <Star size={14} strokeWidth={2.5} fill="currentColor" />
              </span>
            )}
          </div>
          {(handle || country || creatorType) && (
            <div className="profile-meta">
              {handle ? <span className="profile-handle">@{String(handle).replace(/^@/, "")}</span> : null}
              {handle && (country || creatorType) ? <span className="profile-meta-dot">·</span> : null}
              {creatorType ? <span>{creatorType}</span> : null}
              {creatorType && country ? <span className="profile-meta-dot">·</span> : null}
              {country ? <span>{country}</span> : null}
            </div>
          )}
          {bio ? <p className="profile-bio">{bio}</p> : null}
        </div>

        <div className="profile-stats-row profile-stats-row--hero">
          <div className="profile-stat">
            <div className="n">{stats.posts ?? 0}</div>
            <div className="l">{t.posts_count || "Publications"}</div>
          </div>
          <div className="profile-stat">
            <div className="n">{stats.followers ?? 0}</div>
            <div className="l">{t.followers_count || "Abonnés"}</div>
          </div>
          <div className="profile-stat">
            <div className="n">{stats.following ?? 0}</div>
            <div className="l">{t.following_count || "Abonnements"}</div>
          </div>
        </div>

        {(primaryActions || secondaryActions) && (
          <div className="profile-cta-row">
            {primaryActions}
            {secondaryActions}
          </div>
        )}

        {belowActions}

        {onTabChange && (
          <div className="profile-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "publications"}
              className={`profile-tab${tab === "publications" ? " active" : ""}`}
              onClick={() => onTabChange("publications")}
            >
              {t.profile_tab_publications || "Publications"}
            </button>
            {showStoriesTab && (
              <button
                type="button"
                role="tab"
                aria-selected={tab === "stories"}
                className={`profile-tab${tab === "stories" ? " active" : ""}`}
                onClick={() => onTabChange("stories")}
              >
                {t.profile_tab_stories || "Stories"}
              </button>
            )}
            {isSelf && (
              <button
                type="button"
                role="tab"
                aria-selected={tab === "about"}
                className={`profile-tab${tab === "about" ? " active" : ""}`}
                onClick={() => onTabChange("about")}
              >
                {t.profile_tab_about || "Compte"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function ProfileCtaButton({ variant = "primary", children, onClick, disabled, className = "" }) {
  return (
    <button
      type="button"
      className={`profile-cta profile-cta--${variant}${className ? ` ${className}` : ""}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export { MessageCircle, Pencil };
