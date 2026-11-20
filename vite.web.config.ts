import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { DEFAULT_HOST, DEFAULT_PORT } from "./src/server/listen.ts";

/** Where `npm run dev` runs the API, behind this dev server's /api proxy. */
export const DEV_API_PORT = 3001;

// The web app: built into dist/web, which `npm start` serves with the API.
export default defineConfig({
  root: "src/web",
  plugins: [react()],
  build: { outDir: "../../dist/web", emptyOutDir: true },
  server: {
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
    strictPort: true,
    // A pattern, not a prefix: "/api" alone would also send the app's own module /api.ts to the API.
    proxy: { "^/api(/|$)": `http://${DEFAULT_HOST}:${DEV_API_PORT}` },
  },
});
