import { readFile } from "node:fs/promises";
import type { Hono } from "hono";
import type { PreviewSoundJobs } from "./preview-sound.ts";
import { projectExists } from "./projects.ts";
import { errorResponse, noProject } from "./responses.ts";

/**
 * The preview gate's sound (see `preview-sound.ts`): a POST starts it (the
 * page does on opening the gate), a GET says how far it is, and the
 * soundtrack is served by its key once it is ready.
 */
export const previewRoutes = (
  app: Hono,
  { projectsDir, sound }: { projectsDir: string; sound: PreviewSoundJobs },
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
    const key = c.req.param("file").replace(/\.wav$/, "");
    const file = sound.file(slug, key);
    if (!file)
      return errorResponse(c, 404, [{ path: "url", message: "no soundtrack ready for this key" }]);
    return c.body(new Uint8Array(await readFile(file)), 200, {
      "content-type": "audio/wav",
      // The key names the files the sound was made from, so this one never changes.
      "cache-control": "private, max-age=31536000, immutable",
    });
  });
};
