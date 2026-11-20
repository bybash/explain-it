// Builds the render page into dist/render, which `explain-it render` serves
// to headless Chromium. Fonts are served from assets/ next to it.
import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist/render",
    emptyOutDir: true,
    // Not "assets": the server maps /assets/fonts/ to the repository's fonts.
    assetsDir: "bundle",
    // The page carries every Lucide icon, since any node may use any of them.
    chunkSizeWarningLimit: 1000,
    rollupOptions: { input: "src/engine/page/render.html" },
  },
});
