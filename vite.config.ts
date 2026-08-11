import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // pdf.js and jspdf are large; raise the warning ceiling so the build is quiet.
    chunkSizeWarningLimit: 1500,
  },
});
