import { type ChildProcess, spawn } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Browser, chromium, type Page } from "playwright-core";
import { build } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MAX_PROJECT_NAME } from "../schema/project.ts";
import { DEFAULT_HOST } from "./listen.ts";

// The web app in a real browser (AGENTS.md, Tests, layer 5): skipped without Chrome, as on CI.
const hasChrome = await chromium
  .launch({ channel: "chrome" })
  .then((browser) => browser.close().then(() => true))
  .catch(() => false);

const root = new URL("../../", import.meta.url).pathname;
const example = join(root, "examples", "oauth-login");
/** Ports away from the defaults, so a developer's own app on 3000 and 3001 is left alone. */
const START_PORT = 3457;
const DEV_PORT = 3458;
const DEV_API = 3459;

/** Whether something already listens on a port. */
const inUse = (port: number) =>
  new Promise<boolean>((done) => {
    const socket = connect(port, DEFAULT_HOST);
    socket.once("connect", () => {
      socket.destroy();
      done(true);
    });
    socket.once("error", () => done(false));
  });

/** Fails, rather than skips, when a port the test needs is taken: a silent skip would pass the pre-push hook untested. */
const needFree = async (...ports: number[]) => {
  for (const port of ports)
    if (await inUse(port))
      throw new Error(`port ${port} is in use; the web app test needs it free`);
};

const waitUntilUp = async (url: string, output: () => string) => {
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`${url} did not come up:\n${output()}`);
};

type Server = { readonly url: string; readonly stop: () => Promise<void> };

/** Every server the tests started, so each is stopped even when starting it failed. */
const running = new Set<ChildProcess>();

/** Starts a server; its error output is kept for when it fails to come up. */
const launch = (args: readonly string[], env: Record<string, string>) => {
  const child = spawn(process.execPath, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ["ignore", "ignore", "pipe"],
  });
  running.add(child);
  child.once("exit", () => running.delete(child));
  let errors = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    errors = (errors + chunk.toString()).slice(-4000);
  });
  return { child, output: () => errors };
};

const stopped = (child: ChildProcess) =>
  new Promise<void>((done) => {
    if (child.exitCode !== null) return done();
    child.once("exit", () => done());
    child.kill("SIGTERM");
  });

/** `npm start`: the built web app and the API in one process. */
const startServer = async (projectsDir: string): Promise<Server> => {
  const { child, output } = launch(["src/server/main.ts"], {
    PORT: String(START_PORT),
    PROJECTS_DIR: projectsDir,
    ENV_FILE: join(projectsDir, ".env"),
  });
  const url = `http://${DEFAULT_HOST}:${START_PORT}`;
  await waitUntilUp(`${url}/api/projects`, output);
  return { url, stop: () => stopped(child) };
};

/** `npm run dev`: Vite's dev server, passing /api through to the API. */
const devServer = async (projectsDir: string): Promise<Server> => {
  const { child, output } = launch(["scripts/dev.ts"], {
    PORT: String(DEV_PORT),
    DEV_API_PORT: String(DEV_API),
    PROJECTS_DIR: projectsDir,
    ENV_FILE: join(projectsDir, ".env"),
  });
  const url = `http://${DEFAULT_HOST}:${DEV_PORT}`;
  await waitUntilUp(`${url}/api/projects`, output);
  await waitUntilUp(url, output);
  return { url, stop: () => stopped(child) };
};

/** The example, moved back to the graph gate under `slug`. */
const exampleAtGraph = (projectsDir: string, slug: string) => {
  const dir = join(projectsDir, slug);
  cpSync(example, dir, { recursive: true, filter: (source) => !source.includes("/out") });
  const file = join(dir, "project.json");
  writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, "utf8")), gate: "graph" }));
};

/** The flow 3.1 checked by hand, and 3.3's chat and gates, on one running app. */
const flow = (
  serve: (projectsDir: string) => Promise<Server>,
  { restart, ports }: { restart: boolean; ports: readonly number[] },
) => {
  let browser: Browser;
  let page: Page;
  let projectsDir: string;
  let server: Server;

  beforeAll(async () => {
    await needFree(...ports);
    projectsDir = mkdtempSync(join(tmpdir(), "explain-it-web-"));
    server = await serve(projectsDir);
    browser = await chromium.launch({ channel: "chrome" });
    page = await browser.newPage();
  }, 60_000);
  afterAll(async () => {
    await browser?.close();
    await Promise.all([...running].map(stopped));
    if (projectsDir) rmSync(projectsDir, { recursive: true, force: true });
  });

  it("names the error for a name that is too long", async () => {
    await page.goto(`${server.url}/`);
    await page.fill("#new-project-name", "x".repeat(MAX_PROJECT_NAME + 1));
    await page.click("text=Create");
    await expect.poll(() => page.textContent("#new-project-errors")).toContain("name");
  });

  it("creates a project and opens it at the graph gate", async () => {
    await page.fill("#new-project-name", "OAuth login");
    await page.click("text=Create");
    await page.waitForURL(/#\/projects\/oauth-login$/);
    await expect
      .poll(() => page.getAttribute(".gate[data-state=current]", "href"))
      .toBe("#/projects/oauth-login/graph");
    // An address naming a gate not reached yet is corrected to the gate reached.
    await page.goto(`${server.url}/#/projects/oauth-login/render`);
    await page.waitForURL(/#\/projects\/oauth-login\/graph$/);
  });

  it("keeps the chat, with its stub reply, across a restart", async () => {
    await page.fill("#chat-text", "Explain how OAuth login works");
    await page.press("#chat-text", "Enter");
    await expect.poll(() => page.locator(".message").count()).toBe(2);
    await expect
      .poll(() => page.textContent(".message[data-role=assistant]"))
      .toContain("not connected yet");
    if (restart) {
      await server.stop();
      server = await serve(projectsDir);
    }
    await page.reload();
    await expect.poll(() => page.locator(".message").count()).toBe(2);
    expect(await page.textContent(".message[data-role=user]")).toContain("Explain how OAuth");
  });

  it("shows a project made elsewhere without a reload", async () => {
    await page.goto(`${server.url}/#/`);
    await page.waitForSelector(".project-row");
    const made = await fetch(`${server.url}/api/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Made over MCP" }),
    });
    expect(made.status).toBe(201);
    await expect.poll(() => page.locator(".project-row").count()).toBe(2);
  });

  it("approves a gate, moves on, and can go back to it", async () => {
    exampleAtGraph(projectsDir, "oauth-example");
    await page.goto(`${server.url}/#/projects/oauth-example`);
    await page.click("text=Approve and go to Script");
    await page.waitForURL(/#\/projects\/oauth-example\/script$/);
    await expect
      .poll(() => page.getAttribute(".gate[data-state=current]", "href"))
      .toBe("#/projects/oauth-example/script");
    await page.click(".gate[href$='/graph']");
    await expect.poll(() => page.textContent(".approved")).toContain("Approved");
    // Later gates stay closed until the ones before them are approved.
    expect(await page.locator("span.gate[aria-disabled=true]").count()).toBe(3);
  });
};

describe.skipIf(!hasChrome)("the web app (npm start)", () => {
  beforeAll(async () => {
    await build({ configFile: join(root, "vite.web.config.ts"), logLevel: "silent" });
  }, 120_000);
  flow(startServer, { restart: true, ports: [START_PORT] });
});

// npm run dev restarts the API itself when files change, so only npm start is restarted here.
describe.skipIf(!hasChrome)("the web app (npm run dev)", () => {
  flow(devServer, { restart: false, ports: [DEV_PORT, DEV_API] });
});
