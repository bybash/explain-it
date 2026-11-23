import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Hono } from "hono";
import { CONTACT_SHEET } from "../render/sheet.ts";
import { PreviewKeySchema } from "../schema/api.ts";
import type { PreviewChecksJobs } from "./preview-checks.ts";
import type { PreviewSoundJobs } from "./preview-sound.ts";
import { projectDir, projectExists } from "./projects.ts";
import { errorResponse, noProject } from "./responses.ts";

/** The contact sheet's two images, by the file name the route is asked for. */
const SHEET_TYPES = {
  [CONTACT_SHEET.full]: "image/png",
  [CONTACT_SHEET.small]: "image/jpeg",
} as const;

/**
 * The preview gate's sound (see `preview-sound.ts`): a POST starts it (the
 * page does on opening the gate), a GET says how far it is, and the
 * soundtrack is served by its key once it is ready. Its checks (see
 * `preview-checks.ts`) the same way: a POST runs them, a GET gives the run
 * and the last report, and the contact sheet is served beside it.
 */
export const previewRoutes = (
  app: Hono,
  {
    projectsDir,
    sound,
    checks,
  }: { projectsDir: string; sound: PreviewSoundJobs; checks: PreviewChecksJobs },
) => {
  app.post("/api/projects/:slug/preview-sound", async (c) => {
    const slug = c.req.param("slug");
    const started = await sound.start(slug);
    if (!started) return noProject(c, slug);
    if (!started.ok) return errorResponse(c, 422, started.errors);
    return c.json(started.value);
  });

  app.get("/api/projects/:slug/preview-sound", async (c) => {
    const slug = c.req.param("slug");
    if (!(await projectExists(projectsDir, slug))) return noProject(c, slug);
    return c.json(sound.status(slug));
  });

  app.get("/api/projects/:slug/preview-sound/:file{[0-9a-f]+\\.wav}", async (c) => {
    const slug = c.req.param("slug");
    const key = PreviewKeySchema.safeParse(c.req.param("file").replace(/\.wav$/, ""));
    const file = key.success ? sound.file(slug, key.data) : undefined;
    if (!file)
      return errorResponse(c, 404, [{ path: "url", message: "no soundtrack ready for this key" }]);
    return c.body(new Uint8Array(await readFile(file)), 200, {
      "content-type": "audio/wav",
      // The key names the files the sound was made from, so this one never changes.
      "cache-control": "private, max-age=31536000, immutable",
    });
  });

  app.post("/api/projects/:slug/checks", async (c) => {
    const slug = c.req.param("slug");
    const started = await checks.start(slug);
    if (!started) return noProject(c, slug);
    if (!started.ok) return errorResponse(c, 422, started.errors);
    return c.json(started.value);
  });

  app.get("/api/projects/:slug/checks", async (c) => {
    const slug = c.req.param("slug");
    if (!(await projectExists(projectsDir, slug))) return noProject(c, slug);
    return c.json(await checks.status(slug));
  });

  app.get("/api/projects/:slug/checks/:file", async (c) => {
    const slug = c.req.param("slug");
    const file = c.req.param("file");
    if (!(await projectExists(projectsDir, slug))) return noProject(c, slug);
    const type = Object.hasOwn(SHEET_TYPES, file)
      ? SHEET_TYPES[file as keyof typeof SHEET_TYPES]
      : undefined;
    const image = type
      ? await readFile(join(projectDir(projectsDir, slug), file)).catch(() => undefined)
      : undefined;
    if (!type || !image)
      return errorResponse(c, 404, [{ path: "url", message: "no contact sheet: run the checks" }]);
    return c.body(new Uint8Array(image), 200, {
      "content-type": type,
      // Each run of the checks draws it again under the same name.
      "cache-control": "no-store",
    });
  });
};
