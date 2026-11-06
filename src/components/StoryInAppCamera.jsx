import React, { useCallback, useEffect, useRef, useState } from "react";
import { Image as ImageIcon, SwitchCamera, X } from "lucide-react";
import {
  DEFAULT_STORY_FILTER_ID,
  STORY_CAPTURE,
  STORY_FILTERS,
  STORY_VIDEO_MAX_SECONDS,
  cameraErrorKey,
  fitStoryCaptureSize,
  stopMediaStream,
  storyFilterCss,
  storyRecorderOptions,
  storyVideoConstraints,
  storyVideoSecondsLeft,
} from "../lib/storyCreate.js";

/**
 * Full-bleed Story camera — GSM-friendly quality, CSS filter presets, 30s video cap.
 */
export default function StoryInAppCamera({
  mode = "image",
  t = {},
  onCaptureFile,
  onRequestGallery,
  onClose,
  onSelectMode,
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const recordTimerRef = useRef(null);
  const recordStartedAtRef = useRef(0);
  const drawLoopRef = useRef(0);
  const filterCanvasRef = useRef(null);
  const [facingMode, setFacingMode] = useState("environment");
  const [live, setLive] = useState(false);
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const [filterId, setFilterId] = useState(DEFAULT_STORY_FILTER_ID);
  const [secondsLeft, setSecondsLeft] = useState(STORY_VIDEO_MAX_SECONDS);
  const filterIdRef = useRef(filterId);
  filterIdRef.current = filterId;

  const stopDrawLoop = useCallback(() => {
    if (drawLoopRef.current) {
      cancelAnimationFrame(drawLoopRef.current);
      drawLoopRef.current = 0;
    }
  }, []);

  const clearRecordTimer = useCallback(() => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
  }, []);

  const stopStream = useCallback(() => {
    clearRecordTimer();
    stopDrawLoop();
    try {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
    } catch { /* ignore */ }
    recorderRef.current = null;
    chunksRef.current = [];
    setRecording(false);
    setSecondsLeft(STORY_VIDEO_MAX_SECONDS);
    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) stopMediaStream(stream);
    if (videoRef.current) videoRef.current.srcObject = null;
    setLive(false);
  }, [clearRecordTimer, stopDrawLoop]);

  const startStream = useCallback(async (facing = facingMode) => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError(t.story_camera_unavailable || "Caméra indisponible sur cet appareil.");
      setLive(false);
      return;
    }
    if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
      setError(t.story_camera_insecure || "La caméra nécessite une connexion sécurisée (HTTPS).");
      setLive(false);
      return;
    }

    setStarting(true);
    setError("");
    stopStream();

    const wantAudio = mode === "video";
    try {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: storyVideoConstraints(facing),
          audio: wantAudio,
        });
      } catch (firstErr) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: facing },
              width: { ideal: STORY_CAPTURE.idealWidth },
              height: { ideal: STORY_CAPTURE.idealHeight },
            },
            audio: wantAudio,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: wantAudio });
        }
        if (!stream) throw firstErr;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try { await videoRef.current.play(); } catch { /* autoplay */ }
      }
      setLive(true);
      setError("");
    } catch (err) {
      setError(t[cameraErrorKey(err)] || t.story_camera_unavailable || "Caméra indisponible. Utilise la galerie.");
      setLive(false);
    } finally {
      setStarting(false);
    }
  }, [facingMode, mode, stopStream, t]);

  useEffect(() => {
    startStream(facingMode);
    return () => { stopStream(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const flipCamera = async () => {
    const next = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
    await startStream(next);
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video || !live) return;
    const srcW = video.videoWidth || STORY_CAPTURE.idealWidth;
    const srcH = video.videoHeight || STORY_CAPTURE.idealHeight;
    const { width: w, height: h } = fitStoryCaptureSize(srcW, srcH);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.filter = storyFilterCss(filterIdRef.current);
    if (facingMode === "user") {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, w, h);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = "none";
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `story-${Date.now()}.jpg`, { type: "image/jpeg" });
      stopStream();
      onCaptureFile?.(file);
    }, "image/jpeg", STORY_CAPTURE.jpegQuality);
  };

  const buildRecordStream = () => {
    const camStream = streamRef.current;
    const video = videoRef.current;
    if (!camStream || !video) return null;

    const activeFilter = storyFilterCss(filterIdRef.current);
    const needsBake = activeFilter && activeFilter !== "none";

    if (!needsBake || typeof document === "undefined" || !HTMLCanvasElement.prototype.captureStream) {
      return { recordStream: camStream, ownsTracks: false };
    }

    const srcW = video.videoWidth || STORY_CAPTURE.idealWidth;
    const srcH = video.videoHeight || STORY_CAPTURE.idealHeight;
    const { width: w, height: h } = fitStoryCaptureSize(srcW, srcH);
    const canvas = filterCanvasRef.current || document.createElement("canvas");
    filterCanvasRef.current = canvas;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { recordStream: camStream, ownsTracks: false };

    const mirror = facingMode === "user";
    const draw = () => {
      ctx.filter = storyFilterCss(filterIdRef.current);
      if (mirror) {
        ctx.setTransform(-1, 0, 0, 1, w, 0);
      } else {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      try { ctx.drawImage(video, 0, 0, w, h); } catch { /* ignore */ }
      ctx.filter = "none";
      drawLoopRef.current = requestAnimationFrame(draw);
    };
    draw();

    const fps = STORY_CAPTURE.idealFrameRate || 30;
    const canvasStream = canvas.captureStream(fps);
    camStream.getAudioTracks().forEach((track) => {
      try { canvasStream.addTrack(track); } catch { /* ignore */ }
    });
    return { recordStream: canvasStream, ownsTracks: true };
  };

  const finishRecordingCleanup = useCallback(() => {
    clearRecordTimer();
    stopDrawLoop();
    setRecording(false);
    setSecondsLeft(STORY_VIDEO_MAX_SECONDS);
  }, [clearRecordTimer, stopDrawLoop]);

  const startRecording = () => {
    const camStream = streamRef.current;
    if (!camStream || recording) return;
    chunksRef.current = [];

    const built = buildRecordStream();
    if (!built?.recordStream) {
      setError(t.story_record_unsupported || "Enregistrement vidéo non supporté. Utilise la galerie.");
      return;
    }
    const { recordStream } = built;

    const mimeCandidates = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4",
    ];
    const mime = mimeCandidates.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported?.(m)) || "";
    let recorder;
    try {
      const opts = storyRecorderOptions(mime);
      try {
        recorder = new MediaRecorder(recordStream, opts);
      } catch {
        recorder = mime ? new MediaRecorder(recordStream, { mimeType: mime }) : new MediaRecorder(recordStream);
      }
    } catch {
      stopDrawLoop();
      setError(t.story_record_unsupported || "Enregistrement vidéo non supporté. Utilise la galerie.");
      return;
    }

    recorderRef.current = recorder;
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      finishRecordingCleanup();
      const type = recorder.mimeType || mime || "video/webm";
      const blob = new Blob(chunksRef.current, { type });
      chunksRef.current = [];
      const ext = type.includes("mp4") ? "mp4" : "webm";
      const file = new File([blob], `story-${Date.now()}.${ext}`, { type });
      stopStream();
      onCaptureFile?.(file);
    };

    recorder.start(200);
    setRecording(true);
    setSecondsLeft(STORY_VIDEO_MAX_SECONDS);
    recordStartedAtRef.current = Date.now();
    clearRecordTimer();
    recordTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - recordStartedAtRef.current;
      const left = storyVideoSecondsLeft(elapsed);
      setSecondsLeft(left);
      if (elapsed >= STORY_VIDEO_MAX_SECONDS * 1000) {
        clearRecordTimer();
        try {
          if (recorderRef.current && recorderRef.current.state !== "inactive") {
            recorderRef.current.stop();
          }
        } catch { /* ignore */ }
      }
    }, 200);
  };

  const stopRecording = () => {
    clearRecordTimer();
    try {
      if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    } catch { /* ignore */ }
  };

  const mirrored = facingMode === "user";
  const filterCss = storyFilterCss(filterId);
  const progress = recording
    ? Math.min(1, (STORY_VIDEO_MAX_SECONDS - secondsLeft) / STORY_VIDEO_MAX_SECONDS)
    : 0;

  return (
    <div className="story-cam-shell" data-recording={recording ? "1" : "0"}>
      <video
        ref={videoRef}
        className={`story-cam-video${mirrored ? " mirrored" : ""}`}
        style={{ filter: filterCss === "none" ? undefined : filterCss }}
        playsInline
        muted
        autoPlay
      />
      <div className="story-cam-scrim top" />
      <div className="story-cam-scrim bottom" />

      <div className="story-cam-top">
        <button type="button" className="story-cam-icon-btn" onClick={onClose} aria-label="Close">
          <X size={28} strokeWidth={2} />
        </button>
        <div className="story-cam-brand" aria-label="243Kulture Story">
          <span className="story-cam-brand-mark">243</span>
          <span className="story-cam-brand-dot" />
          <span className="story-cam-brand-label">{t.story_24h_badge || "Story 24h"}</span>
        </div>
        <button type="button" className="story-cam-icon-btn" onClick={flipCamera} aria-label="Flip camera">
          <SwitchCamera size={24} strokeWidth={2} />
        </button>
      </div>

      {recording && (
        <div className="story-cam-rec-meter" aria-live="polite">
          <div className="story-cam-rec-bar" style={{ ["--p"]: progress }} />
          <div className="story-cam-rec-time">{secondsLeft}s</div>
        </div>
      )}

      {!live && (
        <div className="story-cam-fallback">
          <div className="cam-title">
            {starting
              ? (t.story_camera_starting || "Ouverture de la caméra…")
              : (mode === "video" ? (t.story_video_title || "Filme ta vibe") : (t.story_camera_title || "Capture ta vibe"))}
          </div>
          {error
            ? <div className="cam-sub err">{error}</div>
            : <div className="cam-sub">{t.story_camera_sub || ""}</div>}
          <button type="button" className="story-cam-fallback-btn" onClick={() => startStream(facingMode)}>
            {t.story_retry_camera || t.story_open_camera || "Réessayer la caméra"}
          </button>
          <button type="button" className="story-cam-fallback-link" onClick={() => onRequestGallery?.()}>
            {t.story_from_gallery || "Choisir dans la galerie"}
          </button>
        </div>
      )}

      {/* Right filter tray — lightweight CSS presets */}
      <div className="story-cam-filters" role="listbox" aria-label={t.story_filters_label || "Filtres"}>
        {STORY_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="option"
            aria-selected={filterId === f.id}
            className={`story-cam-filter-chip${filterId === f.id ? " active" : ""}`}
            onClick={() => setFilterId(f.id)}
            disabled={recording}
          >
            <span className="story-cam-filter-swatch" style={{ filter: f.css === "none" ? undefined : f.css }} />
            <span className="story-cam-filter-name">{t[f.labelKey] || f.id}</span>
          </button>
        ))}
      </div>

      <div className="story-cam-bottom">
        <div className="story-cam-capture-row">
          <button type="button" className="story-cam-gallery" onClick={() => onRequestGallery?.()} aria-label="Gallery">
            <span className="story-cam-gallery-face">
              <ImageIcon size={18} strokeWidth={1.8} />
            </span>
          </button>

          {mode === "image" ? (
            <button
              type="button"
              className="story-cam-shutter"
              onClick={capturePhoto}
              disabled={!live}
              aria-label="Shutter"
            >
              <span className="story-cam-shutter-inner" />
            </button>
          ) : (
            <button
              type="button"
              className={`story-cam-shutter video${recording ? " recording" : ""}`}
              onClick={recording ? stopRecording : startRecording}
              disabled={!live && !recording}
              aria-label={recording ? "Stop" : "Record"}
            >
              <span className={`story-cam-shutter-inner${recording ? " stop" : " rec"}`} />
            </button>
          )}

          <div className="story-cam-gallery spacer" aria-hidden="true" />
        </div>

        <div className="story-cam-modes" role="tablist">
          <button
            type="button"
            role="tab"
            className={`story-cam-mode${mode === "image" ? " active" : ""}`}
            onClick={() => !recording && onSelectMode?.("image")}
          >{t.story_type_photo || "Photo"}</button>
          <button
            type="button"
            role="tab"
            className={`story-cam-mode${mode === "video" ? " active" : ""}`}
            onClick={() => !recording && onSelectMode?.("video")}
          >{t.story_type_video || "Vidéo"}</button>
          <button
            type="button"
            role="tab"
            className="story-cam-mode quiet"
            onClick={() => !recording && onSelectMode?.("text")}
          >{t.story_type_text || "Texte"}</button>
        </div>
      </div>
    </div>
  );
}
