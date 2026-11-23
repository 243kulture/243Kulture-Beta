import React, { useEffect, useRef, useState } from "react";

const LOGO_IMG = "/logo.jpg";
const SPLASH_SESSION_KEY = "243kulture_splash_seen";

/** Total cinematic beat before auto-dismiss (ms). */
export const SPLASH_DURATION_MS = 2800;

export function shouldShowSplashOnBoot() {
  try {
    if (typeof window === "undefined") return false;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      // Still show a brief brand beat, but session skip still applies
    }
    return sessionStorage.getItem(SPLASH_SESSION_KEY) !== "1";
  } catch {
    return true;
  }
}

function markSplashSeen() {
  try { sessionStorage.setItem(SPLASH_SESSION_KEY, "1"); } catch { /* ignore */ }
}

/**
 * Full-bleed cold-start splash — Netflix/Disney+-style logo reveal.
 * Overlay only: does not change gate / CGU / auth routing.
 */
export default function SplashIntro({ onDone, durationMs = SPLASH_DURATION_MS }) {
  const [phase, setPhase] = useState("enter"); // enter | hold | exit
  const doneRef = useRef(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    markSplashSeen();
    onDone?.();
  };

  useEffect(() => {
    const reduced = typeof window !== "undefined"
      && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const total = reduced ? 900 : durationMs;
    const exitAt = Math.max(400, total - 450);
    const tHold = setTimeout(() => setPhase("hold"), Math.min(700, exitAt / 2));
    const tExit = setTimeout(() => setPhase("exit"), exitAt);
    const tDone = setTimeout(finish, total);
    return () => {
      clearTimeout(tHold);
      clearTimeout(tExit);
      clearTimeout(tDone);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationMs]);

  return (
    <div
      className={`splash-intro splash-intro--${phase}`}
      role="dialog"
      aria-label="243Kulture"
      aria-modal="true"
      onClick={finish}
    >
      <div className="splash-intro-atmosphere" aria-hidden="true" />
      <div className="splash-intro-vignette" aria-hidden="true" />
      <div className="splash-intro-stage">
        <img
          className="splash-intro-logo"
          src={LOGO_IMG}
          alt="243Kulture"
          width={220}
          height={220}
          draggable={false}
        />
      </div>
      <button
        type="button"
        className="splash-intro-skip"
        onClick={(e) => { e.stopPropagation(); finish(); }}
      >
        Continuer
      </button>
    </div>
  );
}
