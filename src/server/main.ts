#!/usr/bin/env node
// The app server: the API, and the built web app from dist/web. `npm start`
// runs it; `npm run dev` runs it with API_ONLY=1 behind Vite's dev server.
//   HOST, PORT     where to listen; 127.0.0.1:3000 by default
//   PROJECTS_DIR   the projects folder; ./projects by default
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { formatErrors } from "../schema/errors.ts";
import { createApp } from "./app.ts";
import { listenOptions } from "./listen.ts";

const listen = listenOptions(process.env);
if (!listen.ok) {
  for (const line of formatErrors(listen.errors)) console.error(line);
  process.exit(2);
}
const { hostname, port } = listen.value;
const projectsDir = resolve(process.env.PROJECTS_DIR ?? "projects");
const app = createApp({ projectsDir, now: () => new Date() });

if (process.env.API_ONLY !== "1") {
  const webDir = new URL("../../dist/web/", import.meta.url).pathname;
  const index = new URL("index.html", `file://${webDir}`).pathname;
  if (existsSync(index)) {
    const page = readFileSync(index, "utf8");
    app.use("/assets/*", serveStatic({ root: webDir }));
    // The web app routes in the browser, so every other page that is not the API is its index.
    app.get("*", (c) =>
      c.req.path.startsWith("/api/")
        ? c.json({ errors: [{ path: "url", message: "no such API" }] }, 404)
        : c.html(page),
    );
  } else
    app.get("*", (c) =>
      c.text("The web app is not built yet: run `npm run build`, or use `npm run dev`.", 503),
    );
}

serve({ fetch: app.fetch, hostname, port }, () => {
  console.log(`explAIn-it on http://${hostname}:${port} (projects in ${projectsDir})`);
});
