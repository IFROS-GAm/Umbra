const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("umbraIncomingCallPopup", {
  onData: (listener) => {
    const wrappedListener = (_event, payload) => {
      listener(payload);
    };

    ipcRenderer.on("umbra:call-popup-data", wrappedListener);

    return () => {
      ipcRenderer.removeListener("umbra:call-popup-data", wrappedListener);
    };
  },
  sendAction: (payload) => ipcRenderer.send("umbra:incoming-call-popup-action", payload)
});
