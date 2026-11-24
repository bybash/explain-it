import { type ChildProcess, spawn } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Browser, chromium, type Page } from "playwright-core";
import { build } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isProjectOutput } from "../render/project-output.ts";
import { MAX_PROJECT_NAME } from "../schema/project.ts";
import { clockTime } from "../web/preview-time.ts";
import { DEFAULT_HOST } from "./listen.ts";

// The web app in a real browser (AGENTS.md, Tests, layer 5): skipped without Chrome, as on CI.
const hasChrome = await chromium
  .launch({ channel: "chrome" })
  .then((browser) => browser.close().then(() => true))
  .catch(() => false);

/** The preview's soundtrack is mastered with ffmpeg, as the render's is. */
const hasFfmpeg = await new Promise<boolean>((done) =>
  spawn("ffmpeg", ["-version"], { stdio: "ignore" })
    .once("exit", (code) => done(code === 0))
    .once("error", () => done(false)),
);

const root = new URL("../../", import.meta.url).pathname;
const example = join(root, "examples", "oauth-login");
/** How long a step waits for the page: beside the rest of the suite, the first Mermaid parse is slow. */
const SOON = { timeout: 15_000 };

/** The page's parts, found by their roles and labels rather than by how they look. */
const GATES = "[aria-label=Gates]";
const CURRENT_GATE = `${GATES} [data-state=current]`;
const MESSAGES = "[aria-label=Messages] > li";
const DIAGRAM = "[aria-label='The graph as a diagram']";
const PROJECTS = "[aria-label=Projects] > li";
const GRAPH_GATE = "[aria-label='Graph gate']";
const STYLE_GATE = "[aria-label='Style gate']";

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
  // Up to a minute: beside the rest of the suite's browsers, a server can start slowly.
  for (let i = 0; i < 300; i++) {
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

/** Stops a server, and kills it if it has not stopped within five seconds. */
const stopped = (child: ChildProcess) =>
  new Promise<void>((done) => {
    if (child.exitCode !== null || child.signalCode !== null) return done();
    const kill = setTimeout(() => child.kill("SIGKILL"), 5_000);
    child.once("exit", () => {
      clearTimeout(kill);
      done();
    });
    child.kill("SIGTERM");
  });

/** `npm start`: the built web app and the API in one process. */
const startServer = async (projectsDir: string): Promise<Server> => {
  const { child, output } = launch(["src/server/main.ts"], {
    PORT: String(START_PORT),
    PROJECTS_DIR: projectsDir,
    VOICE: "tone",
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
    VOICE: "tone",
    ENV_FILE: join(projectsDir, ".env"),
  });
  const url = `http://${DEFAULT_HOST}:${DEV_PORT}`;
  await waitUntilUp(`${url}/api/projects`, output);
  await waitUntilUp(url, output);
  return { url, stop: () => stopped(child) };
};

/** The example under `slug`, moved back to `gate`. */
const exampleAt = (projectsDir: string, slug: string, gate: string) => {
  const dir = join(projectsDir, slug);
  cpSync(example, dir, { recursive: true, filter: (source) => !isProjectOutput(source) });
  const file = join(dir, "project.json");
  writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, "utf8")), gate }));
};

/** A 1 × 1 PNG: small, and an image the preview can draw. */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

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
  }, 120_000);
  afterAll(async () => {
    await browser?.close();
    await Promise.all([...running].map(stopped));
    if (projectsDir) rmSync(projectsDir, { recursive: true, force: true });
  }, 30_000);

  it("names the error for a name that is too long", async () => {
    await page.goto(`${server.url}/`);
    await page.fill("#new-project-name", "x".repeat(MAX_PROJECT_NAME + 1));
    await page.click("text=Create");
    await expect.poll(() => page.textContent("#new-project-errors"), SOON).toContain("name");
  });

  it("creates a project and opens it at the graph gate", async () => {
    await page.fill("#new-project-name", "OAuth login");
    await page.click("text=Create");
    await page.waitForURL(/#\/projects\/oauth-login$/);
    await expect
      .poll(() => page.getAttribute(CURRENT_GATE, "href"), SOON)
      .toBe("#/projects/oauth-login/graph");
    // An address naming a gate not reached yet is corrected to the gate reached.
    await page.goto(`${server.url}/#/projects/oauth-login/render`);
    await page.waitForURL(/#\/projects\/oauth-login\/graph$/);
  });

  it("keeps the chat, with its stub reply, across a restart", async () => {
    await page.fill("#chat-text", "Explain how OAuth login works");
    await page.press("#chat-text", "Enter");
    await expect.poll(() => page.locator(MESSAGES).count(), SOON).toBe(2);
    await expect
      .poll(() => page.textContent(`${MESSAGES}[data-role=assistant]`), SOON)
      .toContain("not connected yet");
    if (restart) {
      await server.stop();
      server = await serve(projectsDir);
    }
    await page.reload();
    await expect.poll(() => page.locator(MESSAGES).count(), SOON).toBe(2);
    expect(await page.textContent(`${MESSAGES}[data-role=user]`)).toContain("Explain how OAuth");
  });

  it("edits the graph as Mermaid: drawn as it is typed, saved, and approved", async () => {
    await page.goto(`${server.url}/#/projects/oauth-login/graph`);
    await page.waitForSelector(".cm-content");
    // A new project starts from a small diagram, which must be saved before the gate is approved.
    // Mermaid loads with the first drawing, so it gets longer than the default wait.
    await expect.poll(() => page.textContent(DIAGRAM), { timeout: 30_000 }).toContain("Web app");
    await expect.poll(() => page.isDisabled("text=Approve and go to Script"), SOON).toBe(true);

    await page.click(".cm-content");
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.insertText(
      "flowchart LR\n  %% the user's own note\n  user([User]) -->|signs in| app[Photo app]\n  app --> photos[(Photos)]",
    );
    await expect.poll(() => page.textContent(DIAGRAM), SOON).toContain("Photo app");
    await expect.poll(() => page.isEnabled("text=Save the graph"), SOON).toBe(true);
    await page.click("text=Save the graph");
    await expect
      .poll(() => page.textContent(`${GRAPH_GATE} [role=status]`), SOON)
      .toContain("Saved");
    // The code stays as written, the comment included: it is what was saved.
    expect(await page.textContent(".cm-content")).toContain("%% the user's own note");
    const graph = JSON.parse(readFileSync(join(projectsDir, "oauth-login", "graph.json"), "utf8"));
    expect(graph.nodes.map((n: { id: string; kind: string }) => [n.id, n.kind])).toEqual([
      ["user", "actor"],
      ["app", "service"],
      ["photos", "database"],
    ]);

    // A line Mermaid cannot read is marked, and nothing can be saved until it reads.
    await page.click(".cm-content");
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.insertText("\n  photos -->");
    await page.waitForSelector(".cm-error-line");
    expect(await page.isDisabled("text=Save the graph")).toBe(true);
    // The problem is said once, above the diagram: Mermaid adds no error drawing of its own to the page.
    expect(await page.getByText("Syntax error in text").count()).toBe(0);
    await page.keyboard.press("ControlOrMeta+Z");
    await expect.poll(() => page.locator(".cm-error-line").count(), SOON).toBe(0);

    await page.click("text=Approve and go to Script");
    await page.waitForURL(/#\/projects\/oauth-login\/script$/);
  }, 60_000);

  it("shows a project made elsewhere without a reload", async () => {
    await page.goto(`${server.url}/#/`);
    await page.waitForSelector(PROJECTS);
    const made = await fetch(`${server.url}/api/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Made over MCP" }),
    });
    expect(made.status).toBe(201);
    await expect.poll(() => page.locator(PROJECTS).count(), SOON).toBe(2);
  });

  it("approves a gate, moves on, and can go back to it", async () => {
    exampleAt(projectsDir, "oauth-example", "graph");
    await page.goto(`${server.url}/#/projects/oauth-example`);
    await page.click("text=Approve and go to Script");
    await page.waitForURL(/#\/projects\/oauth-example\/script$/);
    await expect
      .poll(() => page.getAttribute(CURRENT_GATE, "href"), SOON)
      .toBe("#/projects/oauth-example/script");
    await page.click(`${GATES} a[href$="/graph"]`);
    await expect
      .poll(() => page.textContent(`${GRAPH_GATE} p:has(> a[href$="/script"])`), SOON)
      .toContain("Approved");
    // Later gates stay closed until the ones before them are approved.
    expect(await page.locator(`${GATES} [aria-disabled=true]`).count()).toBe(3);
  });

  it("styles the video: the preview follows the form, then it is saved and approved", async () => {
    exampleAt(projectsDir, "oauth-style", "style");
    await page.goto(`${server.url}/#/projects/oauth-style/style`);
    const preview = page.frameLocator("iframe[title='The video with this style']");
    // The player has drawn the video and offers its moments to jump to.
    await page.getByRole("button", { name: "Beat 1", exact: true }).waitFor(SOON);
    // The stage's own styles are on the page: the frame is the video's size, scaled to fit.
    const stage = preview.getByRole("img", { name: "The video at this moment" });
    expect(await stage.evaluate((frame) => getComputedStyle(frame).width)).toBe("1920px");
    const background = () =>
      preview.locator("html").evaluate((html) => getComputedStyle(html).getPropertyValue("--bg"));
    const before = await background();

    await page.getByLabel("Palette").selectOption("ocean");
    await expect.poll(background, SOON).not.toBe(before);
    // The tab whose settings changed is marked; the other is not.
    expect(await page.getByRole("tab", { name: /Look/ }).textContent()).toContain("•");
    expect(await page.getByRole("tab", { name: /Sound/ }).textContent()).not.toContain("•");
    expect(await page.isDisabled("text=Approve and go to Preview")).toBe(true);

    await page.getByLabel("Logo for the light video").setInputFiles({
      name: "logo.png",
      mimeType: "image/png",
      buffer: TINY_PNG,
    });
    await page.getByLabel("Shown").selectOption("all");
    // A logo on every frame is drawn in the preview before it is saved.
    await expect
      .poll(
        () => preview.getByRole("img", { name: "The video at this moment" }).locator("img").count(),
        SOON,
      )
      .toBeGreaterThan(0);

    // The sound: a brisker pace shortens the video in the preview straight away, and the music plays.
    await page.getByRole("tab", { name: /Sound/ }).click();
    const length = () => page.getByText(/^\d+:\d\d \/ \d+:\d\d$/).textContent();
    const relaxed = await length();
    await page.getByLabel("Brisk").check();
    await expect.poll(length, SOON).not.toBe(relaxed);
    const music = page.waitForResponse((r) => r.url().includes("/api/samples/music"));
    await page.getByRole("button", { name: "▶ Listen" }).click();
    expect((await music).headers()["content-type"]).toBe("audio/wav");

    await page.click("text=Save the style");
    await expect
      .poll(() => page.textContent(`${STYLE_GATE} [role=status]`), SOON)
      .toContain("Saved");
    const config = JSON.parse(
      readFileSync(join(projectsDir, "oauth-style", "config.json"), "utf8"),
    );
    expect(config.theme.palette).toBe("ocean");
    expect(config.pacing).toBe("brisk");
    expect(config.logo).toMatchObject({ light: "logo-light.png", show: "all" });
    expect(readFileSync(join(projectsDir, "oauth-style", "assets", "logo-light.png"))).toEqual(
      TINY_PNG,
    );

    await page.click("text=Approve and go to Preview");
    await page.waitForURL(/#\/projects\/oauth-style\/preview$/);
  }, 60_000);

  it.skipIf(!hasFfmpeg)(
    "previews the video with its voice: the sound is made, a beat is jumped to, and it plays",
    async () => {
      // The tone voice (VOICE=tone) stands in for Kokoro, so no model is downloaded.
      exampleAt(projectsDir, "oauth-preview", "preview");
      await page.goto(`${server.url}/#/projects/oauth-preview/preview`);
      const status = page.locator("[aria-labelledby=preview-player-heading] [role=status]");
      await expect
        .poll(() => status.textContent(), { timeout: 60_000 })
        .toContain("The voice and the music are ready");

      const time = () => page.getByText(/^\d+:\d\d \/ \d+:\d\d$/).textContent();
      const third = page
        .getByRole("list", { name: /^Beats of / })
        .first()
        .getByRole("button")
        .nth(2);
      const startsAt = Number(await third.getAttribute("data-starts-at"));
      const shown = clockTime(startsAt);
      await third.click();
      await expect.poll(time, SOON).toMatch(new RegExp(`^${shown} /`));
      await expect.poll(() => third.getAttribute("aria-current"), SOON).toBe("step");

      await page.getByRole("button", { name: "Play" }).click();
      await expect
        .poll(() => page.locator("audio").evaluate((a: HTMLAudioElement) => a.paused), SOON)
        .toBe(false);
      await expect.poll(time, SOON).not.toMatch(new RegExp(`^${shown} /`));
      await page.getByRole("button", { name: "Pause" }).click();
    },
    90_000,
  );

  it.skipIf(!hasFfmpeg)(
    "checks the video from the preview: a warning jumps to its beat, and the contact sheet shows",
    async () => {
      // The tone voice speaks faster than a reader reads, so the example's captions get warnings.
      await page.getByRole("tab", { name: /^Checks/ }).click();
      await page.getByRole("button", { name: "Run the checks" }).click();
      const warnings = page.getByRole("list", { name: "Warnings at beats" });
      await warnings.waitFor({ timeout: 120_000 });
      await expect.poll(() => page.getByRole("tab", { name: /^Checks \(\d+\)$/ }).count()).toBe(1);

      const warning = warnings.getByRole("button").last();
      const beat = await warning.getAttribute("data-beat");
      const at = Number(await warning.getAttribute("data-at"));
      await warning.click();
      expect(await page.getByRole("tab", { name: "Beats" }).getAttribute("aria-selected")).toBe(
        "true",
      );
      const time = () => page.getByText(/^\d+:\d\d \/ \d+:\d\d$/).textContent();
      await expect.poll(time, SOON).toMatch(new RegExp(`^${clockTime(at)} /`));
      const jumpedTo = page.locator(`[data-beat="${beat}"][data-starts-at]`);
      await expect.poll(() => jumpedTo.getAttribute("aria-current"), SOON).toBe("step");
      // The beat carries its warnings' count in the list.
      expect(await jumpedTo.getByText(/^\d+ warnings?$/).count()).toBe(1);
      // The warning's button went with its tab, so the beat jumped to has the focus.
      expect(await jumpedTo.evaluate((button) => button === document.activeElement)).toBe(true);

      await page.getByRole("tab", { name: "Contact sheet" }).click();
      const sheet = page.getByRole("img", { name: /^The contact sheet/ });
      await expect
        .poll(
          () => sheet.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth),
          SOON,
        )
        .toBeGreaterThan(0);
    },
    150_000,
  );

  it.skipIf(!hasFfmpeg)(
    "renders the example from the render gate: it can be cancelled, then plays and downloads",
    async () => {
      await page.click("text=Approve and go to Render");
      await page.waitForURL(/#\/projects\/oauth-preview\/render$/);
      await page.getByLabel("Theme").selectOption("light");
      await page.getByLabel("Resolution").selectOption("720p");

      // A render under way says what it is doing, and stops when cancelled.
      await page.getByRole("button", { name: "Render", exact: true }).click();
      const jobs = page.getByRole("list", { name: "Render jobs" });
      await expect.poll(() => jobs.getByRole("status").first().textContent(), SOON).not.toBe("");
      await jobs.getByRole("button", { name: "Cancel" }).click();
      await expect
        .poll(() => jobs.getByRole("status").first().textContent(), SOON)
        .toBe("Cancelled.");

      await page.getByRole("button", { name: "Render", exact: true }).click();
      await expect
        .poll(() => jobs.getByRole("status").first().textContent(), { timeout: 60_000 })
        .toMatch(/^Capturing the light video: frame \d+ of \d+$/);
      const finished = page.getByRole("article", { name: /^Render of / });
      await finished.waitFor({ timeout: 240_000 });

      const video = finished.getByLabel("The light video", { exact: true });
      await expect
        .poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState >= 1 && v.duration), SOON)
        .toBeGreaterThan(30);
      const srt = finished
        .getByRole("list", { name: "Files of the light video" })
        .getByRole("link", { name: "Captions (.srt)" });
      const download = await page.request.get(
        new URL((await srt.getAttribute("href")) ?? "", page.url()).href,
      );
      expect(download.status()).toBe(200);
      expect(download.headers()["content-disposition"]).toContain("captions.srt");
      expect(await download.text()).toMatch(/^1\n00:00:/);
    },
    360_000,
  );
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
