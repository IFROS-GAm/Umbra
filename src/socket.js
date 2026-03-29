import { io } from "socket.io-client";

let socket;

export function getSocket(accessToken) {
  if (!socket) {
    socket = io(import.meta.env.VITE_SOCKET_URL || window.location.origin, {
      autoConnect: false,
      auth: accessToken ? { token: accessToken } : {},
      transports: ["websocket", "polling"]
    });
  }

  socket.auth = accessToken ? { token: accessToken } : {};
  return socket;
}
