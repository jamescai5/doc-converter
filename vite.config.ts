import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Forward API calls to the Express backend during local development.
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
  build: {
    // pdf.js and jspdf are large; raise the warning ceiling so the build is quiet.
    chunkSizeWarningLimit: 1500,
  },
});
