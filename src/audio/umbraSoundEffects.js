const SOUND_DEFINITIONS = {
  cameraEnable: {
    fileName: "Prender-camara.mp3",
    volume: 0.72
  },
  directCallJoin: {
    fileName: "Entrar-al-chat-de-voz.mp3",
    volume: 0.72
  },
  incomingCall: {
    fileName: "Tono-de-llamada.mp3",
    volume: 0.6
  },
  messageSend: {
    fileName: "Escribir.mp3",
    volume: 0.58
  },
  notification: {
    fileName: "gigidelaromusic-pure-meditation-tone-450975.mp3",
    volume: 0.42
  },
  screenShareOff: {
    fileName: "Apagar-transmision.mp3",
    volume: 0.7
  },
  screenShareOn: {
    fileName: "Prender-transmision.mp3",
    volume: 0.72
  },
  voiceChannelJoin: {
    fileName: "Entrar-en-canal-voz.mp3",
    volume: 0.72
  },
  voiceChannelLeave: {
    fileName: "Salir-canal-voz.mp3",
    volume: 0.72
  },
  voiceDeafen: {
    fileName: "Sordo.mp3",
    volume: 0.66
  },
  voiceMute: {
    fileName: "Mute.mp3",
    volume: 0.66
  }
};

const loopAudioByKey = new Map();
let listenersInstalled = false;

function getBaseUrl() {
  const base = String(import.meta.env.BASE_URL || "/").trim();
  if (!base) {
    return "/";
  }

  return base.endsWith("/") ? base : `${base}/`;
}

function getSoundUrl(key) {
  const definition = SOUND_DEFINITIONS[key];
  if (!definition) {
    return "";
  }

  return `${getBaseUrl()}sounds/${definition.fileName}`;
}

function getDefaultVolume(key, fallback = 1) {
  const definition = SOUND_DEFINITIONS[key];
  return Number.isFinite(Number(definition?.volume))
    ? Math.max(0, Math.min(1, Number(definition.volume)))
    : fallback;
}

function createAudioElement(key, { loop = false, volume } = {}) {
  if (typeof Audio === "undefined") {
    return null;
  }

  const url = getSoundUrl(key);
  if (!url) {
    return null;
  }

  const audio = new Audio(url);
  audio.loop = Boolean(loop);
  audio.preload = "auto";
  audio.volume = Math.max(0, Math.min(1, Number(volume ?? getDefaultVolume(key))));
  return audio;
}

async function safePlay(audio) {
  if (!audio) {
    return false;
  }

  try {
    await audio.play();
    return true;
  } catch {
    return false;
  }
}

function primeAudioPlayback() {
  loopAudioByKey.forEach((audio) => {
    if (audio?.paused) {
      return;
    }

    safePlay(audio);
  });
}

export function initializeUmbraSoundEffects() {
  if (typeof window === "undefined" || listenersInstalled) {
    return;
  }

  const handleUserInteraction = () => {
    primeAudioPlayback();
  };

  window.addEventListener("pointerdown", handleUserInteraction, {
    passive: true
  });
  window.addEventListener("keydown", handleUserInteraction);
  listenersInstalled = true;
}

export function playUmbraSound(key, options = {}) {
  const audio = createAudioElement(key, options);
  if (!audio) {
    return;
  }

  safePlay(audio)
    .catch(() => {})
    .finally(() => {
      audio.addEventListener(
        "ended",
        () => {
          audio.src = "";
        },
        { once: true }
      );
    });
}

export function startUmbraLoopingSound(key, options = {}) {
  const existing = loopAudioByKey.get(key);
  if (existing) {
    existing.loop = true;
    existing.volume = Math.max(
      0,
      Math.min(1, Number(options.volume ?? getDefaultVolume(key, existing.volume)))
    );
    safePlay(existing).catch(() => {});
    return existing;
  }

  const audio = createAudioElement(key, {
    ...options,
    loop: true
  });
  if (!audio) {
    return null;
  }

  loopAudioByKey.set(key, audio);
  safePlay(audio).catch(() => {});
  return audio;
}

export function stopUmbraSound(key, { reset = true } = {}) {
  const audio = loopAudioByKey.get(key);
  if (!audio) {
    return;
  }

  audio.pause();
  if (reset) {
    audio.currentTime = 0;
  }
  loopAudioByKey.delete(key);
}

export function stopAllUmbraSounds() {
  [...loopAudioByKey.keys()].forEach((key) => {
    stopUmbraSound(key);
  });
}

