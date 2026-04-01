import { SpeexWorkletNode, loadSpeex } from "@sapphi-red/web-noise-suppressor";
import speexWasmUrl from "@sapphi-red/web-noise-suppressor/speex.wasm?url";
import speexWorkletUrl from "@sapphi-red/web-noise-suppressor/speexWorklet.js?url";

let speexBinaryPromise = null;

async function getSpeexBinary() {
  if (!speexBinaryPromise) {
    speexBinaryPromise = loadSpeex({ url: speexWasmUrl });
  }

  return speexBinaryPromise;
}

function buildAudioConstraints({ deviceId, noiseSuppressionEnabled }) {
  return {
    audio: {
      autoGainControl: true,
      channelCount: 1,
      deviceId: deviceId && deviceId !== "default" ? { exact: deviceId } : undefined,
      echoCancellation: true,
      noiseSuppression: noiseSuppressionEnabled,
      sampleRate: 48_000,
      sampleSize: 16
    },
    video: false
  };
}

export async function createVoiceInputProcessingSession({
  deviceId,
  inputVolume = 100,
  noiseSuppressionEnabled = true,
  onLevelChange
}) {
  if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === "undefined") {
    throw new Error("Este entorno no permite procesar el microfono.");
  }

  const supportsWorklet =
    noiseSuppressionEnabled &&
    typeof AudioWorkletNode !== "undefined" &&
    typeof window !== "undefined";

  const stream = await navigator.mediaDevices.getUserMedia(
    buildAudioConstraints({
      deviceId,
      noiseSuppressionEnabled
    })
  );

  const context = new AudioContext({
    latencyHint: "interactive"
  });

  if (context.state === "suspended") {
    await context.resume();
  }

  const source = context.createMediaStreamSource(stream);
  const inputGain = context.createGain();
  inputGain.gain.value = Math.max(0, Math.min(1, inputVolume / 100));

  const analyser = context.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.82;

  const sink = context.createGain();
  sink.gain.value = 0;

  let engine = noiseSuppressionEnabled ? "native" : "off";
  let noiseNode = null;

  source.connect(inputGain);

  if (supportsWorklet) {
    try {
      const wasmBinary = await getSpeexBinary();
      await context.audioWorklet.addModule(speexWorkletUrl);
      noiseNode = new SpeexWorkletNode(context, {
        maxChannels: 1,
        wasmBinary
      });
      inputGain.connect(noiseNode);
      noiseNode.connect(analyser);
      engine = "speex";
    } catch {
      inputGain.connect(analyser);
      engine = noiseSuppressionEnabled ? "native" : "off";
    }
  } else {
    inputGain.connect(analyser);
  }

  analyser.connect(sink);
  sink.connect(context.destination);

  const levelData = new Uint8Array(analyser.frequencyBinCount);
  let frameId = 0;

  const pumpLevel = () => {
    analyser.getByteFrequencyData(levelData);
    const peak = levelData.reduce((max, value) => Math.max(max, value), 0);
    const normalized = Math.min(100, Math.round((peak / 255) * 120));
    onLevelChange?.(normalized);
    frameId = window.requestAnimationFrame(pumpLevel);
  };

  frameId = window.requestAnimationFrame(pumpLevel);

  return {
    engine,
    setInputVolume(value) {
      inputGain.gain.value = Math.max(0, Math.min(1, Number(value || 0) / 100));
    },
    async destroy() {
      window.cancelAnimationFrame(frameId);
      onLevelChange?.(0);

      try {
        noiseNode?.destroy?.();
      } catch {
        // Ignore worklet teardown edge cases.
      }

      try {
        sink.disconnect();
        analyser.disconnect();
        inputGain.disconnect();
        source.disconnect();
      } catch {
        // Ignore disconnection issues during teardown.
      }

      stream.getTracks().forEach((track) => track.stop());

      if (context.state !== "closed") {
        await context.close();
      }
    }
  };
}
