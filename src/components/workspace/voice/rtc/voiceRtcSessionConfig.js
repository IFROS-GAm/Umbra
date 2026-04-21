const DEFAULT_ICE_SERVERS = [
  {
    urls: [
      "stun:stun.l.google.com:19302",
      "stun:stun1.l.google.com:19302",
      "stun:stun2.l.google.com:19302",
      "stun:openrelay.metered.ca:80"
    ]
  },
  {
    credential: "openrelayproject",
    urls: [
      "turn:openrelay.metered.ca:80",
      "turn:openrelay.metered.ca:443",
      "turn:openrelay.metered.ca:443?transport=tcp"
    ],
    username: "openrelayproject"
  }
];

function normalizeIceUrls(urls) {
  if (Array.isArray(urls)) {
    return urls.map((value) => String(value || "").trim()).filter(Boolean);
  }

  return String(urls || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function normalizeIceServer(server = {}) {
  const urls = normalizeIceUrls(server.urls);
  if (!urls.length) {
    return null;
  }

  return {
    ...("credential" in server ? { credential: server.credential } : {}),
    urls,
    ...("username" in server ? { username: server.username } : {})
  };
}

function parseIceServersFromEnv() {
  const rawJson = String(import.meta.env.VITE_WEBRTC_ICE_SERVERS_JSON || "").trim();
  const envTurnUrls = normalizeIceUrls(import.meta.env.VITE_WEBRTC_TURN_URLS || "");
  const envTurnUsername = String(import.meta.env.VITE_WEBRTC_TURN_USERNAME || "").trim();
  const envTurnCredential = String(import.meta.env.VITE_WEBRTC_TURN_CREDENTIAL || "").trim();
  const parsedServers = [];

  if (rawJson) {
    try {
      const decoded = JSON.parse(rawJson);
      const list = Array.isArray(decoded) ? decoded : [decoded];
      list
        .map((entry) => normalizeIceServer(entry))
        .filter(Boolean)
        .forEach((entry) => {
          parsedServers.push(entry);
        });
    } catch (error) {
      console.warn("[voice/client] ice:config:invalid-json", {
        message: error?.message || "No se pudo leer VITE_WEBRTC_ICE_SERVERS_JSON."
      });
    }
  }

  if (envTurnUrls.length && envTurnUsername && envTurnCredential) {
    parsedServers.push({
      credential: envTurnCredential,
      urls: envTurnUrls,
      username: envTurnUsername
    });
  }

  return parsedServers;
}

const ENV_ICE_SERVERS = parseIceServersFromEnv();
const SHOULD_FORCE_RELAY =
  String(import.meta.env.VITE_WEBRTC_FORCE_RELAY || "").trim().toLowerCase() === "true";
const LIVEKIT_SERVER_URL = String(import.meta.env.VITE_LIVEKIT_URL || "").trim();
export const MAX_VOICE_PARTICIPANT_VOLUME = 300;
export const MAX_VOICE_PARTICIPANT_INTENSITY = 220;
let sharedVoiceAudioContext = null;

export function hasLiveKitVoiceClientConfig() {
  return Boolean(LIVEKIT_SERVER_URL);
}

export function shouldUseLiveKitVoice(workspaceMode) {
  return workspaceMode === "supabase" && hasLiveKitVoiceClientConfig();
}

export function buildRtcConfiguration() {
  const dedupedServers = new Map();
  const sourceServers = ENV_ICE_SERVERS.length ? ENV_ICE_SERVERS : DEFAULT_ICE_SERVERS;

  sourceServers
    .map((entry) => normalizeIceServer(entry))
    .filter(Boolean)
    .forEach((entry) => {
      const key = JSON.stringify(entry);
      if (!dedupedServers.has(key)) {
        dedupedServers.set(key, entry);
      }
    });

  return {
    bundlePolicy: "max-bundle",
    iceCandidatePoolSize: 4,
    iceServers: [...dedupedServers.values()],
    iceTransportPolicy: SHOULD_FORCE_RELAY ? "relay" : "all"
  };
}

export function clampUnitVolume(value, fallback = 1) {
  const numeric = Number.isFinite(Number(value)) ? Number(value) : fallback;
  return Math.max(0, Math.min(1, numeric));
}

export function clampParticipantVolume(value, fallback = 100) {
  const numeric = Number.isFinite(Number(value)) ? Number(value) : fallback;
  return Math.max(0, Math.min(MAX_VOICE_PARTICIPANT_VOLUME, Math.round(numeric)));
}

export function clampParticipantIntensity(value, fallback = 100) {
  const numeric = Number.isFinite(Number(value)) ? Number(value) : fallback;
  return Math.max(0, Math.min(MAX_VOICE_PARTICIPANT_INTENSITY, Math.round(numeric)));
}

export function normalizeVoiceParticipantAudioPref(pref = {}) {
  return {
    intensity: clampParticipantIntensity(pref?.intensity, 100),
    muted: Boolean(pref?.muted),
    videoHidden: Boolean(pref?.videoHidden),
    volume: clampParticipantVolume(pref?.volume, 100)
  };
}

export function normalizeVoiceParticipantAudioPrefsMap(prefsByUserId = {}) {
  if (!prefsByUserId || typeof prefsByUserId !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(prefsByUserId)
      .filter(([userId]) => String(userId || "").trim())
      .map(([userId, pref]) => [String(userId).trim(), normalizeVoiceParticipantAudioPref(pref)])
  );
}

export function buildParticipantAudioMix(pref = {}) {
  const normalized = normalizeVoiceParticipantAudioPref(pref);
  const intensityNormalized = clampParticipantIntensity(normalized.intensity, 100) / 100;
  const boost = normalized.muted ? 0 : normalized.volume / 100;
  const intensityGain = normalized.muted
    ? 0
    : intensityNormalized <= 1
      ? Math.max(0.45, intensityNormalized)
      : 1 + Math.max(0, normalized.intensity - 100) / 100;
  const compressorAmount =
    Math.max(0, normalized.intensity - 100) / 120 + Math.max(0, boost - 1) / 2.4;
  const compressorEnabled = compressorAmount > 0.001;

  return {
    compressorAttack: compressorEnabled ? 0.003 : 0.001,
    compressorKnee: compressorEnabled ? 22 : 0,
    compressorRatio: compressorEnabled ? 1.8 + compressorAmount * 5.2 : 1,
    compressorRelease: compressorEnabled ? 0.16 : 0.05,
    compressorThreshold: compressorEnabled ? -18 - compressorAmount * 14 : 0,
    intensityGain,
    normalized,
    outputGain: boost
  };
}

export async function applySinkId(audioElement, outputDeviceId) {
  if (!audioElement?.setSinkId || !outputDeviceId) {
    return;
  }

  try {
    await audioElement.setSinkId(outputDeviceId);
  } catch {
    // Keep the default device when Chromium blocks explicit routing.
  }
}

export async function applyAudioContextSinkId(context, outputDeviceId) {
  if (!context?.setSinkId || !outputDeviceId) {
    return;
  }

  try {
    await context.setSinkId(outputDeviceId);
  } catch {
    // Keep the default device when Chromium blocks explicit routing.
  }
}

export function createHiddenAudioElement() {
  const element = document.createElement("audio");
  element.autoplay = true;
  element.controls = false;
  element.defaultMuted = false;
  element.muted = false;
  element.preload = "auto";
  element.playsInline = true;
  element.setAttribute("aria-hidden", "true");
  element.style.height = "1px";
  element.style.left = "-9999px";
  element.style.opacity = "0";
  element.style.pointerEvents = "none";
  element.style.position = "fixed";
  element.style.top = "0";
  element.style.width = "1px";
  document.body.appendChild(element);
  return element;
}

export function getSharedVoiceAudioContext() {
  if (typeof AudioContext === "undefined") {
    return null;
  }

  if (!sharedVoiceAudioContext || sharedVoiceAudioContext.state === "closed") {
    sharedVoiceAudioContext = new AudioContext({
      latencyHint: "interactive"
    });
  }

  return sharedVoiceAudioContext;
}

export async function primeSharedVoiceAudioContext() {
  const context = getSharedVoiceAudioContext();
  if (!context) {
    return null;
  }

  if (context.state === "suspended") {
    await context.resume();
  }

  return context;
}

export function createRemoteStream() {
  return new MediaStream();
}

export function getVoiceSignalType(signal = {}) {
  if (signal?.description?.type) {
    return signal.description.type;
  }

  if (signal?.candidate) {
    return "ice";
  }

  return "unknown";
}

export function hasTrack(stream, kind) {
  return Boolean(stream?.getTracks?.().some((track) => track.kind === kind));
}
