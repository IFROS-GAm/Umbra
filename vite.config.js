import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          icons: ["lucide-react"],
          realtime: ["socket.io-client"],
          supabase: ["@supabase/supabase-js"],
          virtualization: ["react-virtuoso"]
        }
      }
    }
  },
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
