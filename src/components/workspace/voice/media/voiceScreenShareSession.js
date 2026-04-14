const SCREEN_SHARE_QUALITY_PRESETS = {
  "720p30": {
    fps: 30,
    height: 720,
    id: "720p30",
    label: "720P 30 FPS",
    width: 1280
  },
  "1080p30": {
    fps: 30,
    height: 1080,
    id: "1080p30",
    label: "1080P 30 FPS",
    width: 1920
  }
};

function getQualityPreset(quality = "720p30") {
  return SCREEN_SHARE_QUALITY_PRESETS[quality] || SCREEN_SHARE_QUALITY_PRESETS["720p30"];
}

function buildDesktopVideoConstraints({ quality, sourceId }) {
  const preset = getQualityPreset(quality);

  return {
    mandatory: {
      chromeMediaSource: "desktop",
      chromeMediaSourceId: sourceId,
      maxFrameRate: preset.fps,
      maxHeight: preset.height,
      maxWidth: preset.width,
      minFrameRate: preset.fps,
      minHeight: Math.max(360, Math.round(preset.height * 0.75)),
      minWidth: Math.max(640, Math.round(preset.width * 0.75))
    }
  };
}

async function requestDesktopStream({ includeAudio, quality, sourceId }) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Este entorno no permite capturar la pantalla.");
  }

  const video = buildDesktopVideoConstraints({
    quality,
    sourceId
  });

  const desktopAudio = includeAudio
    ? {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: sourceId
        }
      }
    : false;

  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: desktopAudio,
      video
    });
  } catch (error) {
    if (!includeAudio) {
      throw error;
    }

    return navigator.mediaDevices.getUserMedia({
      audio: false,
      video
    });
  }
}

async function requestNativeDisplayStream({ includeAudio, quality }) {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("Este navegador no permite compartir pantalla.");
  }

  const preset = getQualityPreset(quality);

  try {
    return await navigator.mediaDevices.getDisplayMedia({
      audio: includeAudio,
      video: {
        frameRate: {
          ideal: preset.fps,
          max: preset.fps
        },
        height: {
          ideal: preset.height
        },
        width: {
          ideal: preset.width
        }
      }
    });
  } catch (error) {
    if (!includeAudio) {
      throw error;
    }

    return navigator.mediaDevices.getDisplayMedia({
      audio: false,
      video: {
        frameRate: {
          ideal: preset.fps,
          max: preset.fps
        },
        height: {
          ideal: preset.height
        },
        width: {
          ideal: preset.width
        }
      }
    });
  }
}

export async function createVoiceScreenShareSession({
  includeAudio = true,
  label = "",
  onEnded,
  quality = "720p30",
  sourceId = "",
  sourceKind = "window"
}) {
  const desktopMode = Boolean(sourceId);
  const stream = desktopMode
    ? await requestDesktopStream({
        includeAudio,
        quality,
        sourceId
      })
    : await requestNativeDisplayStream({
        includeAudio,
        quality
      });

  const videoTrack = stream.getVideoTracks()[0] || null;
  const audioTrack = stream.getAudioTracks()[0] || null;
  const resolvedLabel = label || videoTrack?.label || "Pantalla compartida";
  const handleEnded = () => {
    onEnded?.();
  };

  if (videoTrack) {
    videoTrack.contentHint = "detail";
    videoTrack.addEventListener("ended", handleEnded);
  }

  return {
    audioAvailable: Boolean(audioTrack),
    kind: sourceKind,
    label: resolvedLabel,
    quality: getQualityPreset(quality),
    setEnabled(value) {
      const nextValue = Boolean(value);
      stream.getTracks().forEach((track) => {
        track.enabled = nextValue;
      });
    },
    sourceId,
    stream,
    async destroy() {
      if (videoTrack) {
        videoTrack.removeEventListener("ended", handleEnded);
      }

      stream.getTracks().forEach((track) => track.stop());
    }
  };
}

export { SCREEN_SHARE_QUALITY_PRESETS, getQualityPreset };
