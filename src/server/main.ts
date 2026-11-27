#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { kokoroProvider } from "../audio/kokoro.ts";
import { toneProvider } from "../audio/tone.ts";
import { fixtureClient } from "../llm/fixtures.ts";
import { formatErrors } from "../schema/errors.ts";
import { createApp } from "./app.ts";
import { listenOptions } from "./listen.ts";
// The app server: the API, and the built web app from dist/web. `npm start`
// runs it; `npm run dev` runs it with API_ONLY=1 behind Vite's dev server.
//   HOST, PORT     where to listen; 127.0.0.1:3000 by default
//   PROJECTS_DIR   the projects folder; ./projects by default
//   CACHE_DIR      the cache folder, for the voice model; ./cache by default
//   PUBLIC_URL     where users open the app, for preview links; the request's own address by default
//   ENV_FILE       the .env file the settings page reads and writes; ./.env by default
//   VOICE          kokoro (the default), or tone: a tone a word with no model, for tests
import { openUrl } from "./open-url.ts";
import { settingsStore } from "./settings.ts";

const listen = listenOptions(process.env);
if (!listen.ok) {
  for (const line of formatErrors(listen.errors)) console.error(line);
  process.exit(2);
}
const { hostname, port } = listen.value;
const voice = process.env.VOICE || "kokoro";
if (voice !== "kokoro" && voice !== "tone") {
  console.error(`VOICE: "${voice}" is not a voice; use kokoro (the default) or tone (for tests)`);
  process.exit(2);
}
const projectsDir = resolve(process.env.PROJECTS_DIR ?? "projects");
// A specific HOST is a name the app is reached by; a wildcard is not one.
const wildcard = hostname === "0.0.0.0" || hostname === "::";
// `.env` is never loaded into the process, so what the environment sets is the user's own.
const settings = settingsStore({
  envFile: resolve(process.env.ENV_FILE ?? ".env"),
  environment: process.env,
});
const app = createApp({
  projectsDir,
  // VOICE=tone speaks each word as a tone, with no model: for the browser test, not for videos.
  tts:
    voice === "tone"
      ? toneProvider()
      : kokoroProvider({ cacheDir: resolve(process.env.CACHE_DIR ?? "cache") }),
  now: () => new Date(),
  hosts: wildcard ? [] : [hostname],
  ...(process.env.PUBLIC_URL ? { publicUrl: process.env.PUBLIC_URL } : {}),
  settings,
  // LLM_FIXTURES=<dir> answers from recorded fixtures only: for the browser test, with no key.
  ...(process.env.LLM_FIXTURES
    ? { llm: fixtureClient({ dir: resolve(process.env.LLM_FIXTURES) }) }
    : {}),
});

if (process.env.API_ONLY !== "1") {
  const webDir = fileURLToPath(new URL("../../dist/web/", import.meta.url));
  const index = join(webDir, "index.html");
  if (existsSync(index)) {
    const page = readFileSync(index, "utf8");
    const preview = readFileSync(join(webDir, "preview.html"), "utf8");
    app.use("/assets/*", serveStatic({ root: webDir }));
    app.get("/preview.html", (c) => c.html(preview));
    app.get("/assets/*", (c) => c.text("not found", 404));
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
  console.log(
    `explAIn-it is running: open ${openUrl(hostname, port)} (projects in ${projectsDir})`,
  );
});
