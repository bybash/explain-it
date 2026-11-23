import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { formatErrors } from "./src/schema/errors.ts";
import { DEFAULT_HOST, devApiPort, listenOptions } from "./src/server/listen.ts";

/** The dev server listens on PORT (3000 by default) and passes the API through to DEV_API_PORT (3001). */
const listen = listenOptions(process.env);
const api = devApiPort(process.env);
if (!listen.ok || !api.ok)
  throw new Error(
    formatErrors([...(listen.ok ? [] : listen.errors), ...(api.ok ? [] : api.errors)]).join("\n"),
  );

// The web app: built into dist/web, which `npm start` serves with the API.
export default defineConfig({
  root: "src/web",
  plugins: [react()],
  build: { outDir: "../../dist/web", emptyOutDir: true },
  // Bundled when the dev server starts, not when the graph gate first opens: found then, they
  // would make Vite reload the page under the user.
  optimizeDeps: {
    include: ["mermaid", "@codemirror/state", "@codemirror/view", "@codemirror/commands"],
  },
  server: {
    host: DEFAULT_HOST,
    port: listen.value.port,
    strictPort: true,
    // Patterns, not prefixes: "/api" alone would also send the app's own module /api.ts to the API.
    // /mcp goes through too, so an IDE uses the same address as the browser and its preview links open.
    proxy: { "^/(api|mcp)(/|$)": `http://${DEFAULT_HOST}:${api.value}` },
  },
});
