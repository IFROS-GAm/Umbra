import { io } from "socket.io-client";

let socket;
let socketUrl = "";

function getSocketUrl() {
  if (typeof window !== "undefined" && window.umbraDesktop?.socketBaseUrl) {
    return window.umbraDesktop.socketBaseUrl;
  }

  return import.meta.env.VITE_SOCKET_URL || window.location.origin;
}

export function getSocket(accessToken) {
  const nextSocketUrl = getSocketUrl();

  if (!socket || socketUrl !== nextSocketUrl) {
    if (socket) {
      socket.disconnect();
    }

    socketUrl = nextSocketUrl;
    socket = io(nextSocketUrl, {
      autoConnect: false,
      auth: accessToken ? { token: accessToken } : {},
      path: "/socket.io",
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
      randomizationFactor: 0.2,
      withCredentials: false,
      transports: ["websocket"],
      upgrade: false,
      rememberUpgrade: true,
      timeout: 5000
    });
  }

  socket.auth = accessToken ? { token: accessToken } : {};
  return socket;
}
