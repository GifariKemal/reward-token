import path from "path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Urutan penting: yang spesifik dulu, baru alias umum
      "wagmi/connectors": path.resolve(__dirname, "./src/shims/wagmi-connectors.ts"),
      "wagmi-connectors-asli": path.resolve(__dirname, "./node_modules/wagmi/dist/esm/exports/connectors.js"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
