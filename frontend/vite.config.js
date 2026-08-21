import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // Mirrors docker/nginx.conf's /api/ proxy_pass (strips the prefix) so
    // `npm run dev` works against a local backend with zero .env setup,
    // matching the relative "/api" default in src/utils/api.js.
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
