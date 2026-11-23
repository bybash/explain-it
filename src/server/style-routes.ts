import { readFile } from "node:fs/promises";
import { extname, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Hono } from "hono";
import { readLogo } from "../render/load.ts";
import { FONTS_PATH, StyleEditSchema } from "../schema/api.ts";
import { parseWith } from "../schema/errors.ts";
import type { Events } from "./events.ts";
import { openProject, projectDir, withProjectLock } from "./projects.ts";
import { errorResponse, jsonBody, noProject } from "./responses.ts";
import { saveStyle } from "./styles.ts";

/** The bundled fonts, which the style gate's preview loads as the renderer does. */
const FONTS = fileURLToPath(new URL("../../assets/fonts/", import.meta.url));

/** The style gate's save, whose requests may carry two logos. */
const STYLE_PATH = "/api/projects/:slug/style";
const STYLE_PATTERN = /^\/api\/projects\/[^/]+\/style$/;

/** Whether a request path is the style gate's save, which may be larger than the rest of the API's. */
export const isStyleSave = (path: string): boolean => STYLE_PATTERN.test(path);

/**
 * The style gate (SPEC, User flow): save the style as MCP's `set_style` does,
 * and what its live preview needs from the server, the saved logo and the
 * bundled fonts.
 */
export const styleRoutes = (
  app: Hono,
  { projectsDir, now, events }: { projectsDir: string; now: () => Date; events: Events },
) => {
  app.put(STYLE_PATH, async (c) => {
    const slug = c.req.param("slug");
    const body = await jsonBody(c);
    if (!body.ok) return errorResponse(c, 400, body.errors);
    const edit = parseWith(StyleEditSchema, body.value);
    if (!edit.ok) return errorResponse(c, 400, edit.errors);
    const result = await withProjectLock(projectsDir, slug, async () => {
      const opened = await openProject(projectsDir, slug);
      if (!opened) return { status: 404 as const };
      if (!opened.ok) return { status: 422 as const, errors: opened.errors };
      const saved = await saveStyle(projectsDir, slug, opened.value, edit.value, now());
      if (!saved.ok) return { status: 400 as const, errors: saved.errors };
      return { status: 200 as const, body: saved.value };
    });
    if (result.status === 404) return noProject(c, slug);
    if (result.status !== 200) return errorResponse(c, result.status, result.errors);
    events.publish({ type: "project-updated", slug });
    return c.json(result.body);
  });

  app.get("/api/projects/:slug/logo", async (c) => {
    const slug = c.req.param("slug");
    const opened = await openProject(projectsDir, slug);
    if (!opened) return noProject(c, slug);
    if (!opened.ok) return errorResponse(c, 422, opened.errors);
    const logo = opened.value.config?.logo;
    if (!logo) return c.json({ logo: null });
    const read = await readLogo(projectDir(projectsDir, slug), logo);
    if (!read.ok) return errorResponse(c, 422, read.errors);
    return c.json({ logo: read.value });
  });

  app.get(`${FONTS_PATH}*`, async (c) => {
    const missing = () => errorResponse(c, 404, [{ path: "url", message: "no such font" }]);
    let path: string;
    try {
      path = decodeURIComponent(new URL(c.req.url).pathname.slice(FONTS_PATH.length));
    } catch {
      return missing();
    }
    const file = normalize(FONTS + path);
    if (!file.startsWith(FONTS) || file.includes(`${sep}..`) || extname(file) !== ".woff2")
      return missing();
    try {
      return c.body(await readFile(file), 200, {
        "content-type": "font/woff2",
        "cache-control": "max-age=86400",
      });
    } catch {
      return missing();
    }
  });
};
