import React, { useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "../../../Icon.jsx";

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }

  const rounded = Math.floor(seconds);
  const minutes = Math.floor(rounded / 60);
  const remainingSeconds = rounded % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatFileSize(size) {
  const value = Number(size) || 0;
  if (!value) {
    return "";
  }

  const units = ["B", "KB", "MB", "GB"];
  let index = 0;
  let current = value;

  while (current >= 1024 && index < units.length - 1) {
    current /= 1024;
    index += 1;
  }

  const digits = current >= 10 || index === 0 ? 0 : 1;
  return `${current.toFixed(digits)} ${units[index]}`;
}

export function AudioAttachmentCard({
  className = "",
  downloadUrl = "",
  error = "",
  name = "Audio",
  size = 0,
  src,
  status = "",
  variant = "message"
}) {
  const audioRef = useRef(null);
  const previousVolumeRef = useRef(1);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return undefined;
    }

    const handleLoadedMetadata = () => {
      setDuration(Number(audio.duration) || 0);
    };
    const handleTimeUpdate = () => {
      setCurrentTime(Number(audio.currentTime) || 0);
    };
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    const handlePause = () => {
      setIsPlaying(false);
    };
    const handlePlay = () => {
      setIsPlaying(true);
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("play", handlePlay);

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("play", handlePlay);
    };
  }, [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.pause();
    audio.currentTime = 0;
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
  }, [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.volume = Math.max(0, Math.min(1, volume));
    audio.muted = isMuted || volume <= 0;
  }, [isMuted, volume]);

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        setIsPlaying(false);
      }
      return;
    }

    audio.pause();
  }

  function handleSeek(event) {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const nextTime = Number(event.target.value) || 0;
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  function handleVolumeChange(event) {
    const nextVolume = Math.max(0, Math.min(1, Number(event.target.value) || 0));
    setVolume(nextVolume);

    if (nextVolume > 0) {
      previousVolumeRef.current = nextVolume;
      setIsMuted(false);
      return;
    }

    setIsMuted(true);
  }

  function toggleMute() {
    if (isMuted || volume <= 0) {
      const restoredVolume = Math.max(previousVolumeRef.current || 0.75, 0.05);
      setVolume(restoredVolume);
      setIsMuted(false);
      return;
    }

    previousVolumeRef.current = volume;
    setIsMuted(true);
  }

  const progressMax = Math.max(duration || 0, 0.01);
  const progressPercent = Math.max(
    0,
    Math.min(100, (Math.min(currentTime, progressMax) / progressMax) * 100)
  );
  const volumePercent = Math.max(0, Math.min(100, volume * 100));
  const sizeLabel = useMemo(() => formatFileSize(size), [size]);
  const timeLabel = duration
    ? `${formatDuration(currentTime)} / ${formatDuration(duration)}`
    : formatDuration(currentTime);
  const volumeIconName = isMuted || volume <= 0 ? "deafen" : "volume";

  return (
    <div className={`audio-attachment-card ${variant} ${className}`.trim()}>
      <audio preload="metadata" ref={audioRef} src={src} />

      {downloadUrl ? (
        <a
          aria-label="Descargar audio"
          className="audio-attachment-card-download"
          download={name}
          href={downloadUrl}
          rel="noreferrer"
          target="_blank"
        >
          <Icon name="download" size={16} />
        </a>
      ) : null}

      <div className="audio-attachment-card-head">
        <div className="audio-attachment-card-art">
          <Icon name="headphones" size={variant === "composer" ? 28 : 24} />
        </div>

        <div className="audio-attachment-card-copy">
          <strong title={name}>{name}</strong>
          {error ? (
            <span className="audio-attachment-card-error">{error}</span>
          ) : sizeLabel ? (
            <span>{sizeLabel}</span>
          ) : status ? (
            <span>{status}</span>
          ) : null}
        </div>
      </div>

      <div className="audio-attachment-card-player">
        <button
          className="audio-attachment-card-toggle"
          onClick={togglePlayback}
          type="button"
        >
          <Icon name={isPlaying ? "pause" : "play"} size={16} />
        </button>

        <div className="audio-attachment-card-timeline">
          <div className="audio-attachment-card-time">
            <span>{timeLabel}</span>
          </div>
          <input
            className="audio-attachment-card-seek"
            max={progressMax}
            min="0"
            onChange={handleSeek}
            step="0.01"
            style={{
              "--audio-progress": `${progressPercent}%`
            }}
            type="range"
            value={Math.min(currentTime, progressMax)}
          />
        </div>

        <div className="audio-attachment-card-volume-control">
          <button
            aria-label={isMuted || volume <= 0 ? "Activar volumen" : "Silenciar audio"}
            className="audio-attachment-card-volume-button"
            onClick={toggleMute}
            type="button"
          >
            <Icon name={volumeIconName} size={18} />
          </button>

          <div className="audio-attachment-card-volume-popover">
            <input
              aria-label="Ajustar volumen"
              className="audio-attachment-card-volume-slider"
              max="1"
              min="0"
              onChange={handleVolumeChange}
              step="0.01"
              style={{
                "--audio-volume-progress": `${volumePercent}%`
              }}
              type="range"
              value={volume}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
