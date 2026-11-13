"use client";

import { useState, useRef, useEffect } from "react";
import { Mic, Square, Trash2, Send, Play, Pause, RefreshCw, X } from "lucide-react";

/**
 * ADDP CRM — Thanh Ghi Âm Giọng Nói Trực Tiếp (Voice Message)
 * Tương thích chuẩn Vpage & Web Audio API (MediaRecorder)
 */

export default function AudioRecorderBar({
  isOpen,
  onClose,
  onSendAudio,
}) {
  const [recordingState, setRecordingState] = useState("idle"); // 'idle' | 'recording' | 'preview' | 'uploading'
  const [duration, setDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      startRecording();
    } else {
      cleanup();
    }
    return () => cleanup();
  }, [isOpen]);

  const cleanup = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setRecordingState("idle");
    setDuration(0);
    setIsPlaying(false);
    setErrorMsg("");
  };

  const startRecording = async () => {
    cleanup();
    setErrorMsg("");

    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        setErrorMsg("Trình duyệt không hỗ trợ ghi âm trực tiếp.");
        setRecordingState("idle");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
        ? "audio/ogg;codecs=opus"
        : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setRecordingState("preview");
      };

      recorder.start(100);
      setRecordingState("recording");

      setDuration(0);
      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("[Audio Record Error]", err);
      setErrorMsg("Không thể truy cập Micro. Vui lòng cấp quyền Microphone cho trình duyệt.");
      setRecordingState("idle");
    }
  };

  const stopRecordingToPreview = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const togglePlayAudio = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleSend = async () => {
    if (audioChunksRef.current.length === 0) return;
    const mimeType = mediaRecorderRef.current?.mimeType || "audio/webm";
    const blob = new Blob(audioChunksRef.current, { type: mimeType });
    const finalDuration = duration;

    setRecordingState("uploading");
    try {
      await onSendAudio(blob, finalDuration, audioUrl);
      onClose();
    } catch (err) {
      setErrorMsg(`Lỗi gửi ghi âm: ${err.message}`);
      setRecordingState("preview");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="p-3 bg-slate-900 border-t border-slate-800 rounded-xl mb-2 animate-in fade-in slide-in-from-bottom-2 duration-150">
      <div className="flex items-center justify-between gap-3">
        {recordingState === "recording" && (
          <div className="flex items-center gap-3 flex-1">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping shrink-0" />
              <span className="text-xs font-bold text-rose-400 font-mono">
                {formatTimer(duration)}
              </span>
            </div>

            {/* Sóng âm thanh mô phỏng */}
            <div className="flex items-center gap-0.5 flex-1 max-w-[120px] h-4">
              {[40, 70, 90, 60, 100, 50, 80, 45, 95, 65, 30].map((h, i) => (
                <span
                  key={i}
                  style={{ height: `${h}%` }}
                  className="w-1 bg-rose-500 rounded-full animate-pulse"
                />
              ))}
            </div>

            <span className="text-[11px] text-slate-400">Đang thu âm giọng nói...</span>
          </div>
        )}

        {recordingState === "preview" && (
          <div className="flex items-center gap-3 flex-1">
            <button
              type="button"
              onClick={togglePlayAudio}
              className="w-7 h-7 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center cursor-pointer transition-colors"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
            </button>

            <span className="text-xs font-bold text-blue-400 font-mono">
              {formatTimer(duration)}
            </span>

            <audio
              ref={audioRef}
              src={audioUrl || ""}
              onEnded={() => setIsPlaying(false)}
              className="hidden"
            />

            <span className="text-[11px] text-slate-400">Nghe lại trước khi gửi</span>
          </div>
        )}

        {recordingState === "idle" && (
          <div className="text-xs text-rose-400 flex-1 truncate">
            {errorMsg || "Chưa bắt đầu thu âm."}
          </div>
        )}

        {recordingState === "uploading" && (
          <div className="flex items-center gap-2 text-xs text-blue-400 flex-1">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            <span>Đang tải lên và gửi ghi âm...</span>
          </div>
        )}

        {/* Nút hành động */}
        <div className="flex items-center gap-2 shrink-0">
          {recordingState === "recording" && (
            <button
              type="button"
              onClick={stopRecordingToPreview}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 text-amber-400" />
              <span>Dừng</span>
            </button>
          )}

          {recordingState === "preview" && (
            <>
              <button
                type="button"
                onClick={startRecording}
                className="px-2 py-1.5 rounded-lg text-slate-400 hover:text-white text-xs inline-flex items-center gap-1 cursor-pointer"
                title="Thu âm lại"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Thu lại</span>
              </button>

              <button
                type="button"
                onClick={handleSend}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm cursor-pointer badge-solid-white"
              >
                <span>Gửi</span>
                <Send className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center cursor-pointer"
            title="Đóng / Hủy"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
