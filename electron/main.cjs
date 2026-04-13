const {
  app,
  BrowserWindow,
  Notification,
  desktopCapturer,
  ipcMain,
  nativeImage,
  screen,
  shell
} = require("electron");
const dotenv = require("dotenv");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const isDev = !app.isPackaged;
const appId = "com.umbra.chat";
const protocolScheme = "umbra";
const serverPort = Number(process.env.ELECTRON_SERVER_PORT || 3130);

let mainWindow = null;
let pendingAuthCallback = null;
let embeddedServer = null;
let incomingCallWindow = null;
let incomingCallPayload = null;
let callSoundInterval = null;
let callSoundEchoTimeout = null;

function clearCallSoundEcho() {
  if (callSoundEchoTimeout) {
    clearTimeout(callSoundEchoTimeout);
    callSoundEchoTimeout = null;
  }
}

function playBeepPattern(kind = "message") {
  try {
    shell.beep();
  } catch {
    // Ignore platform-specific beep issues.
  }

  if (kind === "call") {
    clearCallSoundEcho();
    callSoundEchoTimeout = setTimeout(() => {
      try {
        shell.beep();
      } catch {
        // Ignore platform-specific beep issues.
      }
    }, 180);
    return;
  }

  if (kind === "friend-request") {
    clearCallSoundEcho();
    callSoundEchoTimeout = setTimeout(() => {
      try {
        shell.beep();
      } catch {
        // Ignore platform-specific beep issues.
      }
    }, 120);
    setTimeout(() => {
      try {
        shell.beep();
      } catch {
        // Ignore platform-specific beep issues.
      }
    }, 320);
  }
}

function stopCallSoundLoop() {
  if (callSoundInterval) {
    clearInterval(callSoundInterval);
    callSoundInterval = null;
  }
  clearCallSoundEcho();
}

function startCallSoundLoop() {
  stopCallSoundLoop();
  playBeepPattern("call");
  callSoundInterval = setInterval(() => {
    playBeepPattern("call");
  }, 2600);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/$/, "");
}

function isLoopbackUrl(value) {
  const normalizedValue = trimTrailingSlash(value);
  if (!normalizedValue) {
    return false;
  }

  try {
    const parsedUrl = new URL(normalizedValue);
    return ["127.0.0.1", "localhost", "::1"].includes(parsedUrl.hostname);
  } catch {
    return false;
  }
}

function pickDesktopServiceBaseUrl({
  electronOverride,
  fallbackUrl,
  publicAppUrl,
  viteUrl
}) {
  const explicitUrl = trimTrailingSlash(electronOverride);
  if (explicitUrl) {
    return explicitUrl;
  }

  const normalizedViteUrl = trimTrailingSlash(viteUrl);
  const normalizedPublicAppUrl = trimTrailingSlash(publicAppUrl);

  if (
    normalizedPublicAppUrl &&
    (!normalizedViteUrl || isLoopbackUrl(normalizedViteUrl))
  ) {
    return normalizedPublicAppUrl;
  }

  return normalizedViteUrl || normalizedPublicAppUrl || trimTrailingSlash(fallbackUrl);
}

function getDesktopRuntimeConfig() {
  if (isDev) {
    const publicAppUrl = trimTrailingSlash(
      process.env.ELECTRON_PUBLIC_APP_URL ||
        process.env.PUBLIC_APP_URL ||
        process.env.VITE_PUBLIC_APP_URL ||
        ""
    );
    const apiBaseUrl = pickDesktopServiceBaseUrl({
      electronOverride: process.env.ELECTRON_API_URL,
      fallbackUrl: "http://localhost:3030",
      publicAppUrl,
      viteUrl: process.env.VITE_API_URL
    });
    const socketBaseUrl = pickDesktopServiceBaseUrl({
      electronOverride: process.env.ELECTRON_SOCKET_URL,
      fallbackUrl: apiBaseUrl,
      publicAppUrl: apiBaseUrl,
      viteUrl: process.env.VITE_SOCKET_URL
    });

    return {
      apiBaseUrl,
      isDesktop: true,
      publicAppUrl,
      redirectUri: "umbra://auth/callback",
      socketBaseUrl
    };
  }

  const embeddedBaseUrl = trimTrailingSlash(
    embeddedServer?.url || `http://127.0.0.1:${serverPort}`
  );
  const publicAppUrl = trimTrailingSlash(
    process.env.ELECTRON_PUBLIC_APP_URL ||
      process.env.PUBLIC_APP_URL ||
      process.env.VITE_PUBLIC_APP_URL ||
      embeddedBaseUrl
  );

  return {
    apiBaseUrl: embeddedBaseUrl,
    isDesktop: true,
    publicAppUrl,
    redirectUri: "umbra://auth/callback",
    socketBaseUrl: embeddedBaseUrl
  };
}

function getDesktopLogPath() {
  return path.join(process.env.TEMP || process.cwd(), "umbra-electron.log");
}

function writeDesktopLog(message) {
  try {
    fs.appendFileSync(getDesktopLogPath(), `[${new Date().toISOString()}] ${message}\n`);
  } catch {
    // Ignore logging failures.
  }
}

function loadDesktopEnv() {
  const exeDir = path.dirname(process.execPath);
  const candidatePaths = [
    path.join(process.cwd(), ".env"),
    path.join(exeDir, ".env"),
    path.resolve(exeDir, "..", ".env"),
    path.resolve(exeDir, "..", "..", ".env")
  ];

  for (const candidatePath of candidatePaths) {
    if (fs.existsSync(candidatePath)) {
      dotenv.config({ path: candidatePath, override: false });
      writeDesktopLog(`Loaded env from ${candidatePath}`);
      return candidatePath;
    }
  }

  writeDesktopLog("No external .env file found for desktop runtime.");
  return null;
}

function extractProtocolUrl(argv = []) {
  return argv.find((value) => typeof value === "string" && value.startsWith(`${protocolScheme}://`)) || null;
}

function resolveDesktopIconPath() {
  const candidates = [
    path.join(process.cwd(), "build", "icon.png"),
    path.join(__dirname, "..", "build", "icon.png"),
    path.join(app.getAppPath(), "build", "icon.png"),
    path.join(process.resourcesPath || "", "build", "icon.png"),
    path.join(process.resourcesPath || "", "app.asar.unpacked", "build", "icon.png")
  ];

  return candidates.find((candidatePath) => candidatePath && fs.existsSync(candidatePath)) || null;
}

function resolveNotificationIcon(iconDataUrl = "") {
  if (iconDataUrl) {
    try {
      const image = nativeImage.createFromDataURL(iconDataUrl);
      if (!image.isEmpty()) {
        return image;
      }
    } catch {
      // Fall back to the desktop icon.
    }
  }

  const iconPath = resolveDesktopIconPath();
  return iconPath ? nativeImage.createFromPath(iconPath) : undefined;
}

function registerProtocolClient() {
  if (process.defaultApp) {
    app.setAsDefaultProtocolClient(protocolScheme, process.execPath, [
      path.resolve(process.argv[1] || "")
    ]);
    return;
  }

  app.setAsDefaultProtocolClient(protocolScheme);
}

function dispatchAuthCallback(callbackUrl) {
  pendingAuthCallback = callbackUrl;

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("umbra:oauth-callback", callbackUrl);
  }
}

async function startEmbeddedServer() {
  if (isDev) {
    return null;
  }

  if (embeddedServer) {
    return embeddedServer;
  }

  process.env.UMBRA_DEMO_STORE_PATH =
    process.env.UMBRA_DEMO_STORE_PATH ||
    path.join(app.getPath("userData"), "demo-store.json");

  const serverModuleUrl = pathToFileURL(
    path.join(app.getAppPath(), "server", "start-server.js")
  ).href;
  const { startServer } = await import(serverModuleUrl);
  writeDesktopLog(`Starting embedded server from ${serverModuleUrl}`);

  embeddedServer = await startServer({
    host: "127.0.0.1",
    port: serverPort,
    quiet: true
  });
  writeDesktopLog(`Embedded server ready at ${embeddedServer.url}`);

  return embeddedServer;
}

async function createWindow() {
  const preloadPath = path.join(__dirname, "preload.cjs");
  const iconPath = resolveDesktopIconPath();

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#090b10",
    autoHideMenuBar: true,
    icon: iconPath || undefined,
    title: "Umbra",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath
    }
  });

  if (isDev) {
    const devUrls = [
      "http://127.0.0.1:5173",
      "http://localhost:5173",
      "http://127.0.0.1:5174",
      "http://localhost:5174"
    ];
    let loaded = false;
    let lastError = null;

    for (let attempt = 0; attempt < 12 && !loaded; attempt += 1) {
      for (const url of devUrls) {
        try {
          await mainWindow.loadURL(url);
          loaded = true;
          writeDesktopLog(`Main window loaded from ${url} on attempt ${attempt + 1}.`);
          break;
        } catch (error) {
          lastError = error;
          writeDesktopLog(
            `Dev load failed for ${url} on attempt ${attempt + 1}: ${error.message || error}`
          );
        }
      }

      if (!loaded) {
        await wait(600);
      }
    }

    if (!loaded && lastError) {
      throw lastError;
    }
  } else {
    const serverHandle = await startEmbeddedServer();
    await mainWindow.loadURL(serverHandle.url);
  }

  writeDesktopLog("Main window loaded.");

  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    writeDesktopLog(
      `renderer console [${level}] ${sourceId || "renderer"}:${line || 0} ${message}`
    );
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    writeDesktopLog(`render-process-gone: ${JSON.stringify(details)}`);
  });

  mainWindow.webContents.on("did-finish-load", () => {
    if (pendingAuthCallback) {
      mainWindow.webContents.send("umbra:oauth-callback", pendingAuthCallback);
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function getIncomingCallWindowBounds() {
  const workArea = screen.getPrimaryDisplay().workArea;
  const width = 214;
  const height = 264;

  return {
    height,
    width,
    x: Math.max(workArea.x + 16, workArea.x + workArea.width - width - 20),
    y: Math.max(workArea.y + 16, workArea.y + workArea.height - height - 28)
  };
}

async function ensureIncomingCallWindow() {
  if (incomingCallWindow && !incomingCallWindow.isDestroyed()) {
    return incomingCallWindow;
  }

  const bounds = getIncomingCallWindowBounds();
  incomingCallWindow = new BrowserWindow({
    ...bounds,
    frame: false,
    fullscreenable: false,
    hasShadow: true,
    maximizable: false,
    minimizable: false,
    movable: true,
    resizable: false,
    roundedCorners: true,
    show: false,
    skipTaskbar: true,
    transparent: true,
    alwaysOnTop: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "incoming-call-preload.cjs")
    }
  });

  incomingCallWindow.on("closed", () => {
    incomingCallWindow = null;
    incomingCallPayload = null;
    stopCallSoundLoop();
  });

  await incomingCallWindow.loadFile(path.join(__dirname, "incoming-call.html"));
  incomingCallWindow.webContents.on("did-finish-load", () => {
    if (incomingCallPayload && incomingCallWindow && !incomingCallWindow.isDestroyed()) {
      incomingCallWindow.webContents.send("umbra:call-popup-data", incomingCallPayload);
    }
  });

  return incomingCallWindow;
}

async function showIncomingCallWindow(payload) {
  incomingCallPayload = payload;
  const popupWindow = await ensureIncomingCallWindow();
  const bounds = getIncomingCallWindowBounds();
  popupWindow.setBounds(bounds);

  if (popupWindow.webContents.isLoading()) {
    popupWindow.webContents.once("did-finish-load", () => {
      if (incomingCallPayload && popupWindow && !popupWindow.isDestroyed()) {
        popupWindow.webContents.send("umbra:call-popup-data", incomingCallPayload);
      }
    });
  } else {
    popupWindow.webContents.send("umbra:call-popup-data", incomingCallPayload);
  }

  popupWindow.showInactive();
  startCallSoundLoop();
}

function hideIncomingCallWindow() {
  stopCallSoundLoop();

  if (incomingCallWindow && !incomingCallWindow.isDestroyed()) {
    incomingCallWindow.hide();
  }

  incomingCallPayload = null;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

app.setAppUserModelId(appId);
registerProtocolClient();
loadDesktopEnv();

const startupProtocolUrl = extractProtocolUrl(process.argv);
if (startupProtocolUrl) {
  pendingAuthCallback = startupProtocolUrl;
}

app.on("second-instance", (_event, argv) => {
  const callbackUrl = extractProtocolUrl(argv);
  if (callbackUrl) {
    dispatchAuthCallback(callbackUrl);
  }

  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.focus();
  }
});

app.on("open-url", (event, callbackUrl) => {
  event.preventDefault();
  dispatchAuthCallback(callbackUrl);
});

ipcMain.handle("umbra:open-external", async (_event, url) => {
  await shell.openExternal(url);
  return true;
});

ipcMain.handle("umbra:consume-auth-callback", async () => {
  const callbackUrl = pendingAuthCallback;
  pendingAuthCallback = null;
  return callbackUrl;
});

ipcMain.handle("umbra:list-display-sources", async () => {
  const sources = await desktopCapturer.getSources({
    fetchWindowIcons: true,
    thumbnailSize: {
      height: 540,
      width: 960
    },
    types: ["window", "screen"]
  });

  return sources.map((source) => ({
    appIconDataUrl: source.appIcon?.isEmpty?.() ? "" : source.appIcon?.toDataURL?.() || "",
    displayId: source.display_id || "",
    id: source.id,
    kind: String(source.id || "").startsWith("screen:") ? "screen" : "window",
    name: source.name,
    thumbnailDataUrl: source.thumbnail?.isEmpty?.() ? "" : source.thumbnail?.toDataURL?.() || ""
  }));
});

ipcMain.handle("umbra:show-native-notification", async (_event, payload = {}) => {
  const title = String(payload.title || "Umbra").trim() || "Umbra";
  const body = String(payload.body || "").trim();
  const kind = String(payload.kind || "message").trim().toLowerCase();
  const icon = resolveNotificationIcon(payload.iconDataUrl || "");

  if (Notification.isSupported()) {
    const notification = new Notification({
      body,
      icon,
      silent: true,
      title
    });
    notification.show();
  }

  if (payload.playSound !== false) {
    playBeepPattern(
      kind === "call"
        ? "call"
        : kind === "friend-request"
          ? "friend-request"
          : "message"
    );
  }
  return true;
});

ipcMain.handle("umbra:show-incoming-call-popup", async (_event, payload = {}) => {
  const normalizedPayload = {
    avatarUrl: String(payload.avatarUrl || "").trim(),
    body: String(payload.body || "").trim(),
    callId: String(payload.callId || payload.channelId || "").trim(),
    callerName: String(payload.callerName || "Umbra").trim() || "Umbra",
    channelId: String(payload.channelId || "").trim(),
    channelName: String(payload.channelName || "").trim(),
    kind: String(payload.kind || "call").trim().toLowerCase()
  };

  await showIncomingCallWindow(normalizedPayload);
  return true;
});

ipcMain.handle("umbra:hide-incoming-call-popup", async () => {
  hideIncomingCallWindow();
  return true;
});

ipcMain.on("umbra:incoming-call-popup-action", (_event, payload = {}) => {
  const action = String(payload.action || "").trim().toLowerCase();
  const forwardedPayload = {
    action,
    callId: String(payload.callId || incomingCallPayload?.callId || "").trim(),
    channelId: String(payload.channelId || incomingCallPayload?.channelId || "").trim()
  };

  hideIncomingCallWindow();

  if (action === "accept" && mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.show();
    mainWindow.focus();
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("umbra:incoming-call-action", forwardedPayload);
  }
});

ipcMain.on("umbra:get-runtime-config", (event) => {
  event.returnValue = getDesktopRuntimeConfig();
});

app.whenReady().then(async () => {
  try {
    writeDesktopLog("Electron app ready.");
    const runtimeConfig = getDesktopRuntimeConfig();
    writeDesktopLog(`Desktop runtime config: ${JSON.stringify(runtimeConfig)}`);
    await createWindow();

    app.on("activate", async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        await createWindow();
      }
    });
  } catch (error) {
    writeDesktopLog(`startup failure: ${error.stack || error.message}`);
    throw error;
  }
});

process.on("uncaughtException", (error) => {
  writeDesktopLog(`uncaughtException: ${error.stack || error.message}`);
});

process.on("unhandledRejection", (error) => {
  writeDesktopLog(`unhandledRejection: ${error?.stack || error}`);
});

app.on("before-quit", async () => {
  hideIncomingCallWindow();
  if (embeddedServer?.close) {
    try {
      await embeddedServer.close();
    } catch {
      // Ignore shutdown races.
    }
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
