import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** Where `npm run dev` runs the API, behind this dev server's /api proxy. */
export const DEV_API_PORT = 3001;

// The web app: built into dist/web, which `npm start` serves with the API.
export default defineConfig({
  root: "src/web",
  plugins: [react()],
  build: { outDir: "../../dist/web", emptyOutDir: true },
  server: {
    host: "127.0.0.1",
    port: 3000,
    strictPort: true,
    proxy: { "/api": `http://127.0.0.1:${DEV_API_PORT}` },
  },
});
