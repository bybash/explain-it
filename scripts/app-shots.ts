// Screenshots of every page of the web app, light and dark, from a fixed set of projects:
// run before and after a change to its look, then compare with scripts/compare-shots.ts.
// Usage: node scripts/app-shots.ts <out-dir>   (needs Chrome; builds the web app first)
import { type ChildProcess, spawn } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, type Page } from "playwright-core";
import { build } from "vite";

const [outArg] = process.argv.slice(2);
if (!outArg) throw new Error("usage: node scripts/app-shots.ts <out-dir>");
const out = resolve(outArg);
mkdirSync(out, { recursive: true });

const root = new URL("../", import.meta.url).pathname;
const PORT = 3460;
const url = `http://127.0.0.1:${PORT}`;
/** The time the pages are shown at, so "updated 2 days ago" reads the same on every run. */
const NOW = new Date("2026-11-21T12:00:00.000Z");

/** The projects every run shows: the example at the script gate, a new one with a chat, and a broken one. */
const seed = (dir: string) => {
  const example = join(dir, "oauth-example");
  cpSync(join(root, "examples", "oauth-login"), example, {
    recursive: true,
    filter: (source) => !source.includes("/out") && !source.includes("/cache"),
  });
  const project = JSON.parse(readFileSync(join(example, "project.json"), "utf8"));
  writeFileSync(join(example, "project.json"), JSON.stringify({ ...project, gate: "script" }));

  const draft = join(dir, "photo-upload");
  mkdirSync(draft);
  writeFileSync(
    join(draft, "project.json"),
    JSON.stringify({
      version: 1,
      name: "Photo upload",
      gate: "graph",
      staleBeats: [],
      origin: "web",
      createdAt: "2026-11-20T09:00:00.000Z",
      updatedAt: "2026-11-20T09:30:00.000Z",
    }),
  );
  writeFileSync(
    join(draft, "chat.jsonl"),
    [
      {
        role: "user",
        text: "Explain how a photo upload works",
        gate: "graph",
        at: "2026-11-20T09:30:00.000Z",
      },
      {
        role: "assistant",
        text: "The LLM is not connected yet: edit the graph on the right, then approve it.",
        gate: "graph",
        at: "2026-11-20T09:30:01.000Z",
      },
    ]
      .map((m) => JSON.stringify(m))
      .join("\n")
      .concat("\n"),
  );

  const broken = join(dir, "broken-file");
  mkdirSync(broken);
  writeFileSync(join(broken, "project.json"), '{ "version": 1, "name": 3 }');
};

const waitUntilUp = async (child: ChildProcess) => {
  for (let i = 0; i < 300; i++) {
    if (child.exitCode !== null) throw new Error("the server stopped");
    try {
      if ((await fetch(`${url}/api/projects`)).ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`${url} did not come up`);
};

/** Each shot: a name, the address, and what to do before it is taken. */
const SHOTS: readonly {
  readonly name: string;
  readonly hash: string;
  readonly width?: number;
  readonly ready: (page: Page) => Promise<void>;
}[] = [
  { name: "list", hash: "#/", ready: (p) => p.getByText("Photo upload").waitFor() },
  {
    name: "list-error",
    hash: "#/",
    ready: async (p) => {
      await p.getByText("Photo upload").waitFor();
      await p.fill("#new-project-name", "x".repeat(200));
      await p.getByRole("button", { name: "Create" }).click();
      await p.locator("#new-project-errors").getByText("name").waitFor();
    },
  },
  { name: "settings", hash: "#/settings", ready: (p) => p.getByText("API key").waitFor() },
  {
    name: "graph-gate",
    hash: "#/projects/photo-upload/graph",
    ready: (p) =>
      p
        .locator(".cm-content")
        .waitFor()
        .then(() => diagramDrawn(p)),
  },
  {
    name: "graph-error",
    hash: "#/projects/photo-upload/graph",
    ready: async (p) => {
      await p.locator(".cm-content").waitFor();
      await diagramDrawn(p);
      await p.click(".cm-content");
      await p.keyboard.press("ControlOrMeta+End");
      await p.keyboard.insertText("\n  web -->");
      await p.locator(".cm-error-line").waitFor();
      await p.locator(".cm-content").blur();
    },
  },
  {
    name: "graph-approved",
    hash: "#/projects/oauth-example/graph",
    ready: (p) =>
      p
        .getByText("Approved")
        .first()
        .waitFor()
        .then(() => diagramDrawn(p)),
  },
  {
    name: "script-gate",
    hash: "#/projects/oauth-example/script",
    ready: (p) => p.getByText("comes in a later version").waitFor(),
  },
  {
    name: "broken",
    hash: "#/projects/broken-file",
    ready: (p) => p.getByText("project.json").first().waitFor(),
  },
  {
    name: "graph-narrow",
    hash: "#/projects/photo-upload/graph",
    width: 760,
    ready: (p) =>
      p
        .locator(".cm-content")
        .waitFor()
        .then(() => diagramDrawn(p)),
  },
];

/** Mermaid has drawn, and the drawing has settled. */
const diagramDrawn = async (page: Page) => {
  await page.locator("svg[aria-roledescription]").first().waitFor();
  await page.waitForTimeout(500);
};

await build({ configFile: join(root, "vite.web.config.ts"), logLevel: "silent" });
const projects = mkdtempSync(join(tmpdir(), "explain-it-shots-"));
seed(projects);
const server = spawn(process.execPath, ["src/server/main.ts"], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(PORT),
    PROJECTS_DIR: projects,
    ENV_FILE: join(projects, ".env"),
  },
  stdio: "ignore",
});
const browser = await chromium.launch({ channel: "chrome" });
try {
  await waitUntilUp(server);
  for (const scheme of ["light", "dark"] as const)
    for (const shot of SHOTS) {
      const page = await browser.newPage({
        viewport: { width: shot.width ?? 1280, height: 900 },
        colorScheme: scheme,
      });
      await page.clock.setFixedTime(NOW);
      await page.goto(`${url}/${shot.hash}`);
      await shot.ready(page);
      // No caret or transition caught halfway.
      await page.addStyleTag({
        content:
          "*,*::before,*::after{caret-color:transparent!important;transition:none!important;animation:none!important}",
      });
      const file = join(out, `${shot.name}-${scheme}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log(`saved ${file}`);
      await page.close();
    }
} finally {
  await browser.close();
  server.kill();
  rmSync(projects, { recursive: true, force: true });
}
