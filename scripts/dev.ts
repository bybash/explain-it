// `npm run dev`: the API server restarting on changes, and Vite's dev server
// for the web app on http://127.0.0.1:3000, which passes /api through to it.
import { spawn } from "node:child_process";
import { createServer } from "vite";
import { formatErrors } from "../src/schema/errors.ts";
import { DEFAULT_HOST, devApiPort, listenOptions } from "../src/server/listen.ts";

// PORT is where the pages are (3000 by default); DEV_API_PORT is the API behind them (3001).
const listen = listenOptions(process.env);
const apiPort = devApiPort(process.env);
if (!listen.ok || !apiPort.ok) {
  for (const line of formatErrors([
    ...(listen.ok ? [] : listen.errors),
    ...(apiPort.ok ? [] : apiPort.errors),
  ]))
    console.error(line);
  process.exit(2);
}

const api = spawn(process.execPath, ["--watch-path=src", "src/server/main.ts"], {
  stdio: "inherit",
  // Only Vite's proxy talks to the API in development, so it stays on this machine whatever HOST says.
  // Preview links point at Vite's address, where the pages are, not at the API's own port.
  env: {
    ...process.env,
    HOST: DEFAULT_HOST,
    PORT: String(apiPort.value),
    API_ONLY: "1",
    PUBLIC_URL: `http://${DEFAULT_HOST}:${listen.value.port}`,
  },
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
