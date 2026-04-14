import { CHANNEL_TYPES } from "../constants.js";
import { isGuildVoiceChannel } from "../store/helpers.js";

export function createHttpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function parseAllowedOrigins(extraOrigins = []) {
  const defaultDevOrigins = [
    "http://localhost:3030",
    "http://127.0.0.1:3030",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174"
  ];
  const derivedOrigins = [
    process.env.PUBLIC_APP_URL,
    process.env.RENDER_EXTERNAL_URL
  ]
    .map((origin) => origin?.trim())
    .filter(Boolean);
  const configuredOrigins = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return new Set(
    [...defaultDevOrigins, ...configuredOrigins, ...derivedOrigins, ...extraOrigins].filter(
      Boolean
    )
  );
}

export function isAllowedOrigin(origin, allowedOrigins) {
  if (!origin) {
    return true;
  }

  if (allowedOrigins.size === 0) {
    return true;
  }

  return allowedOrigins.has(origin);
}

export function createCorsOptions(allowedOrigins) {
  return {
    origin(origin, callback) {
      if (isAllowedOrigin(origin, allowedOrigins)) {
        callback(null, true);
        return;
      }

      callback(createHttpError("Origen no permitido.", 403));
    },
    methods: ["GET", "POST", "PATCH", "DELETE"],
    credentials: false
  };
}

export function canUseSharedVoiceChannel(channel) {
  return Boolean(
    channel &&
      (isGuildVoiceChannel(channel) ||
        channel.type === CHANNEL_TYPES.DM ||
        channel.type === CHANNEL_TYPES.GROUP_DM)
  );
}

export function extractBearerToken(value) {
  if (!value) {
    return null;
  }

  const match = String(value).match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : String(value);
}

export async function resolveViewer(store, token, authCache = null) {
  if (store.getMode() !== "supabase") {
    const userId = await store.getDefaultUserId();
    if (!userId) {
      throw createHttpError("No hay usuario demo disponible.", 401);
    }

    return {
      authUser: { id: userId },
      viewer: { id: userId, username: "demo" }
    };
  }

  if (!token) {
    throw createHttpError("Unauthorized", 401);
  }

  const cachedEntry = authCache?.get(token);
  if (cachedEntry && cachedEntry.expiresAt > Date.now()) {
    return cachedEntry.value;
  }

  if (cachedEntry) {
    authCache.delete(token);
  }

  const authUser = await store.verifyAccessToken(token);
  const viewer = await store.ensureProfileFromAuthUser(authUser);

  const resolved = {
    authUser,
    viewer
  };

  if (authCache) {
    authCache.set(token, {
      expiresAt: Date.now() + Number(process.env.AUTH_CACHE_TTL_MS || 15_000),
      value: resolved
    });

    if (authCache.size > Number(process.env.AUTH_CACHE_MAX || 300)) {
      const oldestKey = authCache.keys().next().value;
      if (oldestKey) {
        authCache.delete(oldestKey);
      }
    }
  }

  return resolved;
}

export function createCloseHandle({ io, server }) {
  let closed = false;

  return async () => {
    if (closed) {
      return;
    }

    closed = true;

    await new Promise((resolve) => {
      io.close(() => resolve());
    });

    await new Promise((resolve, reject) => {
      if (!server.listening) {
        resolve();
        return;
      }

      server.close((error) => {
        if (error && error.code !== "ERR_SERVER_NOT_RUNNING") {
          reject(error);
          return;
        }

        resolve();
      });
    });
  };
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

export function normalizeVoiceChannelId(channelId) {
  return String(channelId || "").trim();
}
