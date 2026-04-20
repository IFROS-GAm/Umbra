const { contextBridge, ipcRenderer } = require("electron");

const runtimeConfig = ipcRenderer.sendSync("umbra:get-runtime-config");

contextBridge.exposeInMainWorld("umbraDesktop", {
  ...runtimeConfig,
  consumeAuthCallback: () => ipcRenderer.invoke("umbra:consume-auth-callback"),
  hideIncomingCallPopup: () => ipcRenderer.invoke("umbra:hide-incoming-call-popup"),
  listDisplaySources: () => ipcRenderer.invoke("umbra:list-display-sources"),
  onIncomingCallAction: (listener) => {
    const wrappedListener = (_event, payload) => {
      listener(payload);
    };

    ipcRenderer.on("umbra:incoming-call-action", wrappedListener);

    return () => {
      ipcRenderer.removeListener("umbra:incoming-call-action", wrappedListener);
    };
  },
  openExternalAuth: (url) => ipcRenderer.invoke("umbra:open-external", url),
  openUninstaller: () => ipcRenderer.invoke("umbra:open-uninstaller"),
  showIncomingCallPopup: (payload) =>
    ipcRenderer.invoke("umbra:show-incoming-call-popup", payload),
  showNativeNotification: (payload) =>
    ipcRenderer.invoke("umbra:show-native-notification", payload),
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
