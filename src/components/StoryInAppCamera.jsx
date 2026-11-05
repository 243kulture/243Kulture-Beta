import React, { useCallback, useEffect, useRef, useState } from "react";
import { Camera, SwitchCamera, Video } from "lucide-react";
import { cameraErrorKey, stopMediaStream } from "../lib/storyCreate.js";

/**
 * In-app Story camera: live getUserMedia preview, photo shutter, video record.
 * Stops all tracks on unmount / mode leave. Falls back to gallery when blocked.
 */
export default function StoryInAppCamera({
  mode = "image", // image | video
  t = {},
  onCaptureFile,
  onRequestGallery,
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
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
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
    const videoConstraint = {
      facingMode: { ideal: facing },
      width: { ideal: 1080 },
      height: { ideal: 1920 },
    };

    try {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraint,
          audio: wantAudio,
        });
      } catch (firstErr) {
        // Retry without facingMode ideal / with simpler constraints
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: wantAudio,
        });
        if (!stream) throw firstErr;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try { await videoRef.current.play(); } catch { /* autoplay policies */ }
      }
      setLive(true);
      setError("");
    } catch (err) {
      const key = cameraErrorKey(err);
      setError(t[key] || t.story_camera_unavailable || "Caméra indisponible. Utilise la galerie.");
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
    let recorder;
    const mimeCandidates = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4",
    ];
    const mime = mimeCandidates.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported?.(m)) || "";
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
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
    } catch { /* ignore */ }
    setRecording(false);
  };

  return (
    <div className="story-live-camera">
      <video
        ref={videoRef}
        className="story-live-video"
        playsInline
        muted
        autoPlay
      />
      {!live && (
        <div className="story-live-fallback">
          <Camera size={28} strokeWidth={1.6} color="#E8B84B" />
          <div className="cam-title">{starting ? (t.story_camera_starting || "Ouverture de la caméra…") : (mode === "video" ? (t.story_video_title || "Filme ta vibe") : (t.story_camera_title || "Capture ta vibe"))}</div>
          {error ? <div className="cam-sub" style={{ color: "#f3b4b4" }}>{error}</div> : (
            <div className="cam-sub">{t.story_camera_sub || ""}</div>
          )}
          <button type="button" className="story-camera-cta" onClick={() => startStream(facingMode)}>
            <Camera size={16} strokeWidth={2.2} />
            {t.story_retry_camera || t.story_open_camera || "Réessayer la caméra"}
          </button>
          <button type="button" className="story-gallery-link" onClick={() => onRequestGallery?.()}>
            {t.story_from_gallery || "Choisir dans la galerie"}
          </button>
        </div>
      )}

      {live && (
        <div className="story-live-controls">
          <button type="button" className="story-live-side" onClick={flipCamera} aria-label="Flip camera">
            <SwitchCamera size={20} strokeWidth={2} />
          </button>
          {mode === "image" ? (
            <button type="button" className="story-shutter" onClick={capturePhoto} aria-label="Shutter" />
          ) : (
            <button
              type="button"
              className={`story-shutter video${recording ? " recording" : ""}`}
              onClick={recording ? stopRecording : startRecording}
              aria-label={recording ? "Stop" : "Record"}
            >
              {recording ? <span className="rec-stop" /> : <Video size={18} strokeWidth={2.4} color="#0B0D12" />}
            </button>
          )}
          <button type="button" className="story-live-side ghost" onClick={() => onRequestGallery?.()}>
            {t.story_from_gallery_short || "Galerie"}
          </button>
        </div>
      )}
    </div>
  );
}
