import React, { useCallback, useEffect, useRef, useState } from "react";
import { Image as ImageIcon, SwitchCamera, Type as TypeIcon, Video, X } from "lucide-react";
import { cameraErrorKey, stopMediaStream } from "../lib/storyCreate.js";

/**
 * Full-bleed Story camera (Instagram/TikTok-style overlays, 243Kulture identity).
 * Live getUserMedia preview edge-to-edge; controls float on top.
 * Stops all tracks on unmount / leave.
 */
export default function StoryInAppCamera({
  mode = "image", // image | video
  t = {},
  onCaptureFile,
  onRequestGallery,
  onClose,
  onSelectMode, // (mode: image|video|text) => void
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const [facingMode, setFacingMode] = useState("environment");
  const [live, setLive] = useState(false);
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);

  const stopStream = useCallback(() => {
    try {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
    } catch { /* ignore */ }
    recorderRef.current = null;
    chunksRef.current = [];
    setRecording(false);
    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) stopMediaStream(stream);
    if (videoRef.current) videoRef.current.srcObject = null;
    setLive(false);
  }, []);

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
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1080 },
            height: { ideal: 1920 },
          },
          audio: wantAudio,
        });
      } catch (firstErr) {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: wantAudio });
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
    const w = video.videoWidth || 720;
    const h = video.videoHeight || 1280;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Mirror selfie stills so they match preview
    if (facingMode === "user") {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `story-${Date.now()}.jpg`, { type: "image/jpeg" });
      stopStream();
      onCaptureFile?.(file);
    }, "image/jpeg", 0.92);
  };

  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream || recording) return;
    chunksRef.current = [];
    const mimeCandidates = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4",
    ];
    const mime = mimeCandidates.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported?.(m)) || "";
    let recorder;
    try {
      recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch {
      setError(t.story_record_unsupported || "Enregistrement vidéo non supporté. Utilise la galerie.");
      return;
    }
    recorderRef.current = recorder;
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
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
  };

  const stopRecording = () => {
    try {
      if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    } catch { /* ignore */ }
    setRecording(false);
  };

  const mirrored = facingMode === "user";

  return (
    <div className="story-cam-shell" data-recording={recording ? "1" : "0"}>
      <video
        ref={videoRef}
        className={`story-cam-video${mirrored ? " mirrored" : ""}`}
        playsInline
        muted
        autoPlay
      />
      <div className="story-cam-scrim top" />
      <div className="story-cam-scrim bottom" />

      {/* Top overlay — Instagram-like minimal */}
      <div className="story-cam-top">
        <button type="button" className="story-cam-icon-btn" onClick={onClose} aria-label="Close">
          <X size={26} strokeWidth={2.2} />
        </button>
        <div className="story-cam-badge">
          <span className="story-cam-badge-mark">243</span>
          <span>{t.story_24h_badge || "Story 24h"}</span>
        </div>
        <button type="button" className="story-cam-icon-btn" onClick={flipCamera} aria-label="Flip camera">
          <SwitchCamera size={22} strokeWidth={2.2} />
        </button>
      </div>

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
          <button type="button" className="story-camera-cta" onClick={() => startStream(facingMode)}>
            {t.story_retry_camera || t.story_open_camera || "Réessayer la caméra"}
          </button>
          <button type="button" className="story-gallery-link" onClick={() => onRequestGallery?.()}>
            {t.story_from_gallery || "Choisir dans la galerie"}
          </button>
        </div>
      )}

      {/* Bottom capture chrome */}
      <div className="story-cam-bottom">
        <div className="story-cam-modes" role="tablist">
          <button
            type="button"
            role="tab"
            className={`story-cam-mode${mode === "image" ? " active" : ""}`}
            onClick={() => onSelectMode?.("image")}
          >{t.story_type_photo || "Photo"}</button>
          <button
            type="button"
            role="tab"
            className={`story-cam-mode${mode === "video" ? " active" : ""}`}
            onClick={() => onSelectMode?.("video")}
          >{t.story_type_video || "Vidéo"}</button>
          <button
            type="button"
            role="tab"
            className="story-cam-mode secondary"
            onClick={() => onSelectMode?.("text")}
          >
            <TypeIcon size={12} strokeWidth={2.4} />
            {t.story_type_text || "Texte"}
          </button>
        </div>

        <div className="story-cam-capture-row">
          <button type="button" className="story-cam-gallery" onClick={() => onRequestGallery?.()} aria-label="Gallery">
            <ImageIcon size={20} strokeWidth={2} />
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
      </div>
    </div>
  );
}
