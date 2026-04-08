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
      autoGainControl: false,
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
  onLevelChange,
  onSpeakingChange
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
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.55;

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

  const timeDomainData = new Float32Array(analyser.fftSize);
  let frameId = 0;
  let displayLevel = 0;
  let noiseFloor = 0.006;
  let speaking = false;
  let speechHoldUntil = 0;

  const pumpLevel = () => {
    analyser.getFloatTimeDomainData(timeDomainData);

    let sumSquares = 0;
    let peak = 0;
    for (const sample of timeDomainData) {
      const absolute = Math.abs(sample);
      sumSquares += sample * sample;
      if (absolute > peak) {
        peak = absolute;
      }
    }

    const rms = Math.sqrt(sumSquares / timeDomainData.length) || 0;
    const now = performance.now();

    if (!speaking) {
      const noiseBlend = rms < noiseFloor ? 0.12 : 0.01;
      noiseFloor = noiseFloor * (1 - noiseBlend) + rms * noiseBlend;
    } else {
      noiseFloor = noiseFloor * 0.995 + Math.min(rms, noiseFloor) * 0.005;
    }

    const floor = Math.max(noiseFloor, 0.0035);
    const speakThreshold = Math.max(floor * 2.7, 0.012);
    const releaseThreshold = Math.max(floor * 1.9, 0.009);
    const speechDetected = rms > speakThreshold || peak > speakThreshold * 3.4;

    if (speechDetected) {
      speechHoldUntil = now + 180;
    }

    const nextSpeaking = speechDetected || now < speechHoldUntil;
    if (nextSpeaking !== speaking) {
      speaking = nextSpeaking;
      onSpeakingChange?.(speaking);
    }

    const activeThreshold = speaking ? releaseThreshold : speakThreshold;
    const normalizedRaw = Math.max(0, (rms - activeThreshold) / Math.max(0.03, 0.09 - activeThreshold));
    const normalizedTarget = Math.min(100, normalizedRaw * 100);
    const smoothing = speaking ? 0.28 : 0.14;
    displayLevel = displayLevel * (1 - smoothing) + normalizedTarget * smoothing;

    if (!speaking && displayLevel < 2) {
      displayLevel = 0;
    }

    onLevelChange?.(Math.round(displayLevel));
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
      onSpeakingChange?.(false);

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
