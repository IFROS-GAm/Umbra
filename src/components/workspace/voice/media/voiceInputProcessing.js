import {
  NoiseGateWorkletNode,
  SpeexWorkletNode,
  loadSpeex
} from "@sapphi-red/web-noise-suppressor";
import noiseGateWorkletUrl from "@sapphi-red/web-noise-suppressor/noiseGateWorklet.js?url";
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

function clampPercent(value, fallback = 0) {
  const numeric = Number.isFinite(Number(value)) ? Number(value) : fallback;
  return Math.max(0, Math.min(100, numeric));
}

function resolveNoiseGateProfile(amount) {
  const normalized = clampPercent(amount, 44) / 100;
  const openThreshold = -72 + normalized * 22;
  const closeThreshold = openThreshold - (7 + (1 - normalized) * 4);
  const holdMs = 150 + (1 - normalized) * 80;

  return {
    closeThreshold,
    holdMs,
    openThreshold
  };
}

function createDualMonoVoiceOutput(context, inputNode) {
  if (!context || !inputNode) {
    return null;
  }

  const monoMixer = context.createGain();
  monoMixer.channelCount = 1;
  monoMixer.channelCountMode = "explicit";
  monoMixer.channelInterpretation = "speakers";

  const stereoMerger = context.createChannelMerger(2);

  inputNode.connect(monoMixer);
  monoMixer.connect(stereoMerger, 0, 0);
  monoMixer.connect(stereoMerger, 0, 1);

  return {
    monoMixer,
    stereoMerger
  };
}

export async function createVoiceInputProcessingSession({
  deviceId,
  inputVolume = 100,
  monitorEnabled = false,
  noiseSuppressionAmount = 44,
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
  const outboundDestination = context.createMediaStreamDestination();
  let outboundDualMono = null;

  const monitorGain = context.createGain();
  monitorGain.gain.value = monitorEnabled ? 0.92 : 0;

  let engine = noiseSuppressionEnabled ? "native" : "off";
  let noiseNode = null;
  let gateNode = null;
  let processedOutput = inputGain;

  source.connect(inputGain);

  if (supportsWorklet) {
    try {
      const wasmBinary = await getSpeexBinary();
      await context.audioWorklet.addModule(noiseGateWorkletUrl);
      await context.audioWorklet.addModule(speexWorkletUrl);
      if (noiseSuppressionEnabled) {
        noiseNode = new SpeexWorkletNode(context, {
          maxChannels: 1,
          wasmBinary
        });
        inputGain.connect(noiseNode);
        processedOutput = noiseNode;
        engine = "speex";
      }

      if (noiseSuppressionEnabled) {
        const gateProfile = resolveNoiseGateProfile(noiseSuppressionAmount);
        gateNode = new NoiseGateWorkletNode(context, {
          closeThreshold: gateProfile.closeThreshold,
          holdMs: gateProfile.holdMs,
          maxChannels: 1,
          openThreshold: gateProfile.openThreshold
        });
        processedOutput.connect(gateNode);
        processedOutput = gateNode;
      }
    } catch {
      engine = noiseSuppressionEnabled ? "native" : "off";
      processedOutput = inputGain;
    }
  }

  processedOutput.connect(analyser);
  outboundDualMono = createDualMonoVoiceOutput(context, processedOutput);

  if (outboundDualMono?.stereoMerger) {
    outboundDualMono.stereoMerger.connect(outboundDestination);
  } else {
    processedOutput.connect(outboundDestination);
  }

  processedOutput.connect(monitorGain);
  monitorGain.connect(context.destination);

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
    const suppressionBias = clampPercent(noiseSuppressionAmount, 44) / 100;

    if (!speaking) {
      const noiseBlend = rms < noiseFloor ? 0.12 : 0.01;
      noiseFloor = noiseFloor * (1 - noiseBlend) + rms * noiseBlend;
    } else {
      noiseFloor = noiseFloor * 0.995 + Math.min(rms, noiseFloor) * 0.005;
    }

    const floor = Math.max(noiseFloor, 0.0035);
    const speakThreshold = Math.max(
      floor * (2.05 + suppressionBias * 0.95),
      0.0085 + suppressionBias * 0.0065
    );
    const releaseThreshold = Math.max(
      floor * (1.55 + suppressionBias * 0.6),
      0.0068 + suppressionBias * 0.0045
    );
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
    rawStream: stream,
    stream: outboundDestination.stream,
    setInputVolume(value) {
      inputGain.gain.value = Math.max(0, Math.min(1, Number(value || 0) / 100));
    },
    setTrackEnabled(nextEnabled) {
      stream.getAudioTracks().forEach((track) => {
        track.enabled = Boolean(nextEnabled);
      });
      outboundDestination.stream.getAudioTracks().forEach((track) => {
        track.enabled = Boolean(nextEnabled);
      });
    },
    setMonitoringEnabled(nextEnabled) {
      monitorGain.gain.cancelScheduledValues(context.currentTime);
      monitorGain.gain.setValueAtTime(monitorGain.gain.value, context.currentTime);
      monitorGain.gain.linearRampToValueAtTime(nextEnabled ? 0.92 : 0, context.currentTime + 0.08);
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
        gateNode?.disconnect?.();
      } catch {
        // Ignore gate teardown edge cases.
      }

      try {
        outboundDualMono?.monoMixer?.disconnect?.();
        outboundDualMono?.stereoMerger?.disconnect?.();
        monitorGain.disconnect();
        outboundDestination.disconnect();
        analyser.disconnect();
        inputGain.disconnect();
        source.disconnect();
        noiseNode?.disconnect?.();
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
