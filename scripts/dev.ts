// `npm run dev`: the API server restarting on changes, and Vite's dev server
// for the web app on http://127.0.0.1:3000, which passes /api through to it.
import { spawn } from "node:child_process";
import { createServer } from "vite";
import { DEFAULT_HOST } from "../src/server/listen.ts";
import { DEV_API_PORT } from "../vite.web.config.ts";

const api = spawn(process.execPath, ["--watch-path=src", "src/server/main.ts"], {
  stdio: "inherit",
  // Only Vite's proxy talks to the API in development, so it stays on this machine whatever HOST says.
  env: { ...process.env, HOST: DEFAULT_HOST, PORT: String(DEV_API_PORT), API_ONLY: "1" },
});

const web = await createServer({ configFile: "vite.web.config.ts" });
await web.listen();
web.printUrls();

const stop = async () => {
  api.kill();
  await web.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
api.on("exit", (code) => {
  if (code !== null && code !== 0) console.error(`the API server stopped with ${code}`);
});
