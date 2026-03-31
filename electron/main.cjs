const { app, BrowserWindow, ipcMain, shell } = require("electron");
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

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/$/, "");
}

function getDesktopRuntimeConfig() {
  if (isDev) {
    const apiBaseUrl = trimTrailingSlash(
      process.env.ELECTRON_API_URL ||
        process.env.VITE_API_URL ||
        "http://localhost:3030"
    );
    const socketBaseUrl = trimTrailingSlash(
      process.env.ELECTRON_SOCKET_URL ||
        process.env.VITE_SOCKET_URL ||
        apiBaseUrl
    );

    return {
      apiBaseUrl,
      isDesktop: true,
      redirectUri: "umbra://auth/callback",
      socketBaseUrl
    };
  }

  const embeddedBaseUrl = trimTrailingSlash(
    embeddedServer?.url || `http://127.0.0.1:${serverPort}`
  );

  return {
    apiBaseUrl: embeddedBaseUrl,
    isDesktop: true,
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
    await mainWindow.loadURL("http://localhost:5173");
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

ipcMain.on("umbra:get-runtime-config", (event) => {
  event.returnValue = getDesktopRuntimeConfig();
});

app.whenReady().then(async () => {
  try {
    writeDesktopLog("Electron app ready.");
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
