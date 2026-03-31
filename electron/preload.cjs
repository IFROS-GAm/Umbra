const { contextBridge, ipcRenderer } = require("electron");

const runtimeConfig = ipcRenderer.sendSync("umbra:get-runtime-config");

contextBridge.exposeInMainWorld("umbraDesktop", {
  ...runtimeConfig,
  consumeAuthCallback: () => ipcRenderer.invoke("umbra:consume-auth-callback"),
  openExternalAuth: (url) => ipcRenderer.invoke("umbra:open-external", url),
  onAuthCallback: (listener) => {
    const wrappedListener = (_event, callbackUrl) => {
      listener(callbackUrl);
    };

    ipcRenderer.on("umbra:oauth-callback", wrappedListener);

    return () => {
      ipcRenderer.removeListener("umbra:oauth-callback", wrappedListener);
    };
  }
});
