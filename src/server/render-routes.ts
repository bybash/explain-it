import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname } from "node:path";
import { Readable } from "node:stream";
import type { Context, Hono } from "hono";
import { loadProject } from "../render/load.ts";
import type { RenderQueue } from "../render/queue.ts";
import { renderFilePath, rendersIn } from "../render/renders.ts";
import { RenderAskSchema, type RendersView } from "../schema/api.ts";
import { parseWith } from "../schema/errors.ts";
import { projectDir, projectExists } from "./projects.ts";
import { errorResponse, jsonBody, noProject } from "./responses.ts";

/** How each kind of file a render writes is served. */
const TYPES: Readonly<Record<string, string>> = {
  ".mp4": "video/mp4",
  ".srt": "application/x-subrip",
  ".wav": "audio/wav",
  ".png": "image/png",
};

/**
 * A `Range: bytes=a-b` header as the first and last byte asked for, or why
 * it cannot be served; undefined for a header of another form, which is
 * answered with the whole file.
 */
const rangeOf = (
  header: string,
  size: number,
): { start: number; end: number } | "unsatisfiable" | undefined => {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === "" && match[2] === "")) return undefined;
  const [, from = "", to = ""] = match;
  // "bytes=-500" asks for the last 500 bytes.
  const start = from === "" ? Math.max(0, size - Number(to)) : Number(from);
  const end = from === "" || to === "" ? size - 1 : Math.min(Number(to), size - 1);
  return start > end || start >= size ? "unsatisfiable" : { start, end };
};

/** A file as a response: whole, or the part a range asks for, which a video player needs to seek. */
const fileResponse = async (c: Context, path: string, download: string | undefined) => {
  const { size } = await stat(path);
  const headers: Record<string, string> = {
    "content-type": TYPES[extname(path)] ?? "application/octet-stream",
    "accept-ranges": "bytes",
    // A render's folder is never written again once it is finished.
    "cache-control": "private, max-age=31536000, immutable",
    ...(download ? { "content-disposition": `attachment; filename="${download}"` } : {}),
  };
  const header = c.req.header("range");
  const asked = header ? rangeOf(header, size) : undefined;
  if (asked === "unsatisfiable")
    return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
  const range = asked ?? { start: 0, end: size - 1 };
  const body = Readable.toWeb(createReadStream(path, range)) as ReadableStream;
  return new Response(body, {
    status: asked ? 206 : 200,
    headers: {
      ...headers,
      "content-length": String(range.end - range.start + 1),
      ...(asked ? { "content-range": `bytes ${range.start}-${range.end}/${size}` } : {}),
    },
  });
};

/**
 * The render gate (SPEC, Rendering): queue a render of the project, with
 * the theme and resolution asked for or its style's; list its jobs and its
 * finished renders; cancel one; and serve a finished render's files, in
 * parts for a player to seek, or as a download.
 */
export const renderRoutes = (
  app: Hono,
  { projectsDir, renders }: { projectsDir: string; renders: RenderQueue },
) => {
  app.get("/api/projects/:slug/renders", async (c) => {
    const slug = c.req.param("slug");
    if (!(await projectExists(projectsDir, slug))) return noProject(c, slug);
    const view: RendersView = {
      jobs: renders.list().filter((job) => job.slug === slug),
      renders: await rendersIn(projectDir(projectsDir, slug)),
    };
    return c.json(view);
  });

  app.post("/api/projects/:slug/renders", async (c) => {
    const slug = c.req.param("slug");
    if (!(await projectExists(projectsDir, slug))) return noProject(c, slug);
    const body = await jsonBody(c);
    if (!body.ok) return errorResponse(c, 400, body.errors);
    const ask = parseWith(RenderAskSchema, body.value);
    if (!ask.ok) return errorResponse(c, 400, ask.errors);
    // Read as the renderer reads it, so a project that cannot render is said now, not after the queue.
    const loaded = await loadProject(projectDir(projectsDir, slug));
    if (!loaded.ok) return errorResponse(c, 422, loaded.errors);
    return c.json(renders.add({ slug, ...ask.value }), 202);
  });

  app.post("/api/projects/:slug/renders/:job/cancel", (c) => {
    const slug = c.req.param("slug");
    const job = renders.get(c.req.param("job"));
    if (!job || job.slug !== slug)
      return errorResponse(c, 404, [
        { path: "job", message: `no render job "${c.req.param("job")}"` },
      ]);
    const cancelled = renders.cancel(job.id);
    return cancelled.ok ? c.json(cancelled.value) : errorResponse(c, 409, cancelled.errors);
  });

  app.get("/api/projects/:slug/renders/:stamp/:theme/:file", async (c) => {
    const slug = c.req.param("slug");
    const { stamp, theme, file } = c.req.param();
    const path = (await projectExists(projectsDir, slug))
      ? await renderFilePath(projectDir(projectsDir, slug), stamp, theme, file)
      : undefined;
    if (!path)
      return errorResponse(c, 404, [{ path: "url", message: "no such file in a finished render" }]);
    const download = c.req.query("download") ? `${slug}-${theme}-${file}` : undefined;
    return fileResponse(c, path, download);
  });
};
