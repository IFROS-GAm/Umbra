import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3030",
      "/socket.io": {
        target: "http://localhost:3030",
        ws: true
      }
    }
  }
});
