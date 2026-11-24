// Screenshots of every page of the web app, light and dark, from a fixed set of projects:
// run before and after a change to its look, then compare with scripts/compare-shots.ts.
// Usage: node scripts/app-shots.ts <out-dir>
// Needs Chrome. It builds the web app into dist/web first, as `npm run build` does.
import { type ChildProcess, spawn } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, type Page } from "playwright-core";
import { build } from "vite";
import { isProjectOutput } from "../src/render/project-output.ts";

const [outArg] = process.argv.slice(2);
if (!outArg) throw new Error("usage: node scripts/app-shots.ts <out-dir>");
const out = resolve(outArg);
mkdirSync(out, { recursive: true });

const root = new URL("../", import.meta.url).pathname;
const PORT = 3460;
const url = `http://127.0.0.1:${PORT}`;
/** The time the pages are shown at, so "updated 2 days ago" reads the same on every run. */
const NOW = new Date("2026-11-21T12:00:00.000Z");

/** The projects every run shows: the example at the preview gate, a new one with a chat, and a broken one. */
const seed = (dir: string) => {
  const example = join(dir, "oauth-example");
  cpSync(join(root, "examples", "oauth-login"), example, {
    recursive: true,
    filter: (source) => !isProjectOutput(source),
  });
  const project = JSON.parse(readFileSync(join(example, "project.json"), "utf8"));
  writeFileSync(join(example, "project.json"), JSON.stringify({ ...project, gate: "preview" }));
  // The example's story, so the Script gate shows a brief filled in.
  writeFileSync(
    join(example, "brief.json"),
    JSON.stringify({
      version: 1,
      audience: "Developers new to the codebase",
      takeaway: "The app never sees the password: it gets a token instead.",
      shape: "problem",
      hook: "Where does your password go when you sign in with Google?",
      notes: "Leave out token refresh; it has its own video.",
    }),
  );
  // The example again, at the render gate, for its renders.
  const rendering = join(dir, "oauth-render");
  cpSync(example, rendering, { recursive: true });
  writeFileSync(
    join(rendering, "project.json"),
    JSON.stringify({ ...project, name: "Sign-in video", gate: "render" }),
  );

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
      .concat("not a message")
      .join("\n")
      .concat("\n"),
  );
  writeFileSync(
    join(dir, "house-rules.md"),
    "- No jargon without saying what it means.\n- End with a link to the docs.\n",
  );
  // A saved key, so the settings show its hint and the box to remove it.
  writeFileSync(join(dir, ".env"), "LLM_API_KEY=sk-or-v1-0123456789abcdef\n");

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

/** The graph editor is open and Mermaid has drawn its diagram. */
const graphReady = async (page: Page) => {
  await page.locator(".cm-content").waitFor();
  await diagramDrawn(page);
};

/** Types at the end of the Mermaid code, then leaves the editor so no caret or active line shows. */
const typeInGraph = async (page: Page, text: string) => {
  await graphReady(page);
  await page.click(".cm-content");
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText(text);
  await page.locator(".cm-content").blur();
};

/** Each shot: a name, the address, the width, and what to do before it is taken. */
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
  {
    name: "list-hover-focus",
    hash: "#/",
    ready: async (p) => {
      await p.getByText("Photo upload").waitFor();
      await p.getByText("could not be read").click();
      await p.getByRole("link", { name: /OAuth login/ }).hover();
      await p.focus("#new-project-name");
      await p.keyboard.press("Tab");
    },
  },
  {
    name: "settings",
    hash: "#/settings",
    ready: (p) => p.getByText("Remove the saved key").waitFor(),
  },
  { name: "graph-gate", hash: "#/projects/photo-upload/graph", ready: graphReady },
  {
    name: "graph-error",
    hash: "#/projects/photo-upload/graph",
    ready: async (p) => {
      await typeInGraph(p, "\n  web -->");
      await p.locator(".cm-error-line").waitFor();
    },
  },
  {
    name: "graph-notes",
    hash: "#/projects/photo-upload/graph",
    ready: async (p) => {
      await typeInGraph(p, "\n  style web fill:#f00");
      await p.getByLabel("Left out of the graph").waitFor();
      await diagramDrawn(p);
    },
  },
  {
    name: "graph-approved",
    hash: "#/projects/oauth-example/graph",
    ready: async (p) => {
      await p.getByText("Approved").first().waitFor();
      await diagramDrawn(p);
    },
  },
  {
    name: "script-gate",
    hash: "#/projects/oauth-example/script",
    ready: (p) => p.getByText("comes in a later version").waitFor(),
  },
  {
    name: "style-gate",
    hash: "#/projects/oauth-example/style",
    ready: async (p) => {
      await p.getByRole("button", { name: "Beat 1", exact: true }).waitFor();
      await p.waitForTimeout(500);
    },
  },
  {
    name: "style-changed",
    hash: "#/projects/oauth-example/style",
    ready: async (p) => {
      await p.getByRole("button", { name: "Beat 1", exact: true }).waitFor();
      await p.getByLabel("Palette").selectOption("ocean");
      await p.getByLabel("Show the dark video").check();
      await p.getByRole("button", { name: "Beat 3", exact: true }).click();
      await p.waitForTimeout(1500);
    },
  },
  {
    name: "style-sound",
    hash: "#/projects/oauth-example/style",
    ready: async (p) => {
      await p.getByRole("button", { name: "Beat 1", exact: true }).waitFor();
      await p.getByRole("tab", { name: /Sound/ }).click();
      await p.getByLabel("Brisk").check();
      await p.waitForTimeout(500);
    },
  },
  {
    name: "preview-gate",
    hash: "#/projects/oauth-example/preview",
    ready: async (p) => {
      await p.getByText("The voice and the music are ready").waitFor({ timeout: 60_000 });
      await p
        .getByRole("list", { name: /^Beats of / })
        .first()
        .getByRole("button")
        .nth(2)
        .click();
      await p.waitForTimeout(800);
    },
  },
  {
    name: "preview-checks",
    hash: "#/projects/oauth-example/preview",
    ready: async (p) => {
      await checksRun(p);
      await p.waitForTimeout(300);
    },
  },
  {
    name: "preview-warning-jump",
    hash: "#/projects/oauth-example/preview",
    ready: async (p) => {
      await checksRun(p);
      await p.getByRole("list", { name: "Warnings at beats" }).getByRole("button").nth(3).click();
      await p.waitForTimeout(800);
    },
  },
  {
    name: "preview-contact-sheet",
    hash: "#/projects/oauth-example/preview",
    ready: async (p) => {
      await checksRun(p);
      await p.getByRole("tab", { name: "Contact sheet" }).click();
      await p
        .getByRole("img", { name: /^The contact sheet/ })
        .evaluate((img: HTMLImageElement) => img.decode());
    },
  },
  {
    name: "render-running",
    hash: "#/projects/oauth-render/render",
    ready: async (p) => {
      await p.getByLabel("Resolution").selectOption("720p");
      await p.getByLabel("Theme").selectOption("light");
      await p.getByRole("button", { name: "Render", exact: true }).click();
      await p
        .getByRole("list", { name: "Render jobs" })
        .getByText(/^Capturing the light video: frame/)
        .waitFor({ timeout: 120_000 });
    },
  },
  {
    name: "render-done",
    hash: "#/projects/oauth-render/render",
    ready: async (p) => {
      // The render the shot before started, once it is finished and nothing else is under way.
      await p
        .getByRole("article", { name: /^Render of / })
        .first()
        .waitFor({ timeout: 240_000 });
      await p
        .getByRole("list", { name: "Render jobs" })
        .waitFor({ state: "detached", timeout: 240_000 });
      await p
        .getByLabel("The light video", { exact: true })
        .first()
        .evaluate((v: HTMLVideoElement) =>
          v.readyState >= 1
            ? undefined
            : new Promise((r) => v.addEventListener("loadedmetadata", r)),
        );
    },
  },
  {
    name: "broken",
    hash: "#/projects/broken-file",
    ready: (p) => p.getByText("project.json").first().waitFor(),
  },
  // Between the two breakpoints: the chat beside the panel, the editor over the diagram.
  { name: "graph-mid", hash: "#/projects/photo-upload/graph", width: 1000, ready: graphReady },
  { name: "graph-narrow", hash: "#/projects/photo-upload/graph", width: 760, ready: graphReady },
  { name: "graph-phone", hash: "#/projects/photo-upload/graph", width: 390, ready: graphReady },
  {
    name: "settings-phone",
    hash: "#/settings",
    width: 390,
    ready: (p) => p.getByText("API key").waitFor(),
  },
];

/** The preview's sound made and its checks run, from the Checks tab. */
const checksRun = async (page: Page) => {
  await page.getByText("The voice and the music are ready").waitFor({ timeout: 60_000 });
  await page.getByRole("tab", { name: /^Checks/ }).click();
  await page.getByRole("button", { name: /^Run the checks/ }).click();
  await page.getByRole("list", { name: "Warnings at beats" }).waitFor({ timeout: 120_000 });
};

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
    // A tone for each word instead of Kokoro, so the preview's sound needs no model.
    VOICE: "tone",
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
