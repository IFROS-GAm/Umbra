function buildVideoConstraints({ deviceId }) {
  return {
    audio: false,
    video: {
      deviceId: deviceId && deviceId !== "default" ? { exact: deviceId } : undefined,
      frameRate: {
        ideal: 30,
        max: 30
      },
      height: {
        ideal: 720
      },
      width: {
        ideal: 1280
      }
    }
  };
}

export async function createVoiceCameraSession({ deviceId }) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Este entorno no permite abrir la camara.");
  }

  const stream = await navigator.mediaDevices.getUserMedia(
    buildVideoConstraints({
      deviceId
    })
  );

  const videoTrack = stream.getVideoTracks()[0] || null;

  return {
    label: videoTrack?.label || "",
    setEnabled(value) {
      stream.getVideoTracks().forEach((track) => {
        track.enabled = Boolean(value);
      });
    },
    stream,
    async destroy() {
      stream.getTracks().forEach((track) => track.stop());
    }
  };
}
