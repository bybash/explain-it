import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
/** Where `npm run build:engine` writes the render page, for installs without Vite. */
const DIST = join(ROOT, "dist", "render");
/** Where each render builds a page of its own, so renders at the same time never share one. */
const BUILDS = join(ROOT, "dist", "render-builds");
const FONTS = join(ROOT, "assets", "fonts");
/** The page's path inside the build, which keeps the source layout. */
const PAGE = "src/engine/page/render.html";
const VITE = join(ROOT, "node_modules", ".bin", "vite");

const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

/**
 * Builds the render page with Vite when Vite is installed (a checkout of this
 * repository), so a render always shows the current engine. Without Vite, the
 * page must already be built.
 */
export const buildRenderPage = async (): Promise<RenderPageBuild> => {
  if (!existsSync(VITE)) {
    if (!existsSync(join(DIST, PAGE)))
      throw new Error(`the render page is not built: run \`npm run build:engine\` (${DIST})`);
    return { dir: DIST, remove: async () => {} };
  }
  // A folder per build: Vite empties its output first, which would pull the page from under another render.
  const dir = join(BUILDS, randomUUID());
  // Not execFileSync: the server keeps answering while a render builds its page.
  await promisify(execFile)(
    VITE,
    ["build", "--config", "vite.render.config.ts", "--logLevel", "error", "--outDir", dir],
    { cwd: ROOT },
  );
  return { dir, remove: () => rm(dir, { recursive: true, force: true }) };
};

/** A built render page: its folder, and how to remove it once the render is over. */
export type RenderPageBuild = { readonly dir: string; readonly remove: () => Promise<void> };

/** A file under `root` for a URL path, or undefined when the path leaves it. */
const inside = (root: string, path: string): string | undefined => {
  const file = normalize(join(root, path));
  return file.startsWith(root + sep) ? file : undefined;
};

/**
 * Serves the built render page and the bundled fonts on 127.0.0.1, on a free
 * port, and returns the page's URL. Fonts come from `assets/fonts/`, where the
 * page looks for them.
 */
export const serveRenderPage = async (
  dir: string,
): Promise<{ url: string; close: () => Promise<void> }> => {
  const server = createServer(async (request, response) => {
    const path = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    const file = path.startsWith("/assets/fonts/")
      ? inside(FONTS, path.slice("/assets/fonts/".length))
      : inside(dir, path);
    try {
      if (!file) throw new Error("outside");
      const body = await readFile(file);
      response.writeHead(200, {
        "content-type": TYPES[extname(file)] ?? "application/octet-stream",
      });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/${PAGE}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
};
