import { join } from "node:path";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { MiddlewareHandler } from "hono";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { streamSSE } from "hono/streaming";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { createMcpServer } from "../mcp/server.ts";
import { loadProject } from "../render/load.ts";
import { RenderQueue, type RenderRun } from "../render/queue.ts";
import { renderProjectFolder } from "../render/run.ts";
import type { ValidationError } from "../schema/errors.ts";
import { formatErrors } from "../schema/errors.ts";
import { createEvents } from "./events.ts";
import { createProject, listProjects, openProject } from "./projects.ts";

export type AppOptions = {
  /** The folder that holds one folder per project. */
  readonly projectsDir: string;
  /** The clock, passed in so tests can fix it. */
  readonly now: () => Date;
  /** Host names besides this machine's own that requests may be addressed to, such as a set HOST. */
  readonly hosts?: readonly string[];
  /**
   * Where users open the app, for preview links, when it is not where requests
   * arrive: behind `npm run dev`'s proxy, the API's own port serves no pages.
   */
  readonly publicUrl?: string;
  /** How a render job runs; the real renderer by default, a fake in tests. */
  readonly renderRun?: RenderRun;
};

/** The real renderer: the project's files as they are when the job starts, into its out/. */
const renderFromFolder =
  (projectsDir: string, now: () => Date): RenderRun =>
  async (request, { onProgress, signal }) => {
    const dir = join(projectsDir, request.slug);
    const project = await loadProject(dir);
    if (!project.ok) throw new Error(formatErrors(project.errors).join("\n"));
    return renderProjectFolder({
      dir,
      project: project.value,
      settings: request,
      now: now(),
      onProgress,
      signal,
    });
  };

/** How often an idle event stream sends a comment, so proxies and browsers keep it open. */
const KEEP_ALIVE_MS = 15_000;
/** The largest request bodies: projects' own files are far smaller; MCP can carry a 2 MB logo as base64. */
const MAX_API_BYTES = 1024 * 1024;
const MAX_MCP_BYTES = 4 * 1024 * 1024;
/** Names this machine answers to; a request addressed to any other name did not come from its user. */
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

/** Every error response has this shape: what is wrong, each naming its place. */
const errorResponse = (
  c: Context,
  status: ContentfulStatusCode,
  errors: readonly ValidationError[],
) => c.json({ errors }, status);

/**
 * The API: projects over the folders in `projectsDir`, and server-sent events.
 * Request bodies go through their zod schemas; errors name the field, and the
 * file when it is a project file that is wrong.
 *
 * There is no login (SPEC, App and stack), so the API only answers its own
 * pages: a request addressed to another host name, as DNS rebinding sends,
 * or from another site's page, is refused, and bodies must be JSON, which a
 * cross-site form or simple fetch cannot send.
 */
export const createApp = ({
  projectsDir,
  now,
  hosts = [],
  publicUrl,
  renderRun = renderFromFolder(projectsDir, now),
}: AppOptions) => {
  const app = new Hono();
  const events = createEvents();
  // One queue for the app: MCP and, from 3.9, the web app's render gate share it.
  const renders = new RenderQueue({
    run: renderRun,
    now,
    onChange: (job) =>
      events.publish({
        type: "render",
        job: job.id,
        slug: job.slug,
        state: job.state,
        ...(job.progress ? { percent: job.progress.percent } : {}),
      }),
  });
  const allowed = new Set([...LOCAL_HOSTS, ...hosts]);

  const guard: MiddlewareHandler = async (c, next) => {
    const host = new URL(c.req.url).hostname;
    if (!allowed.has(host) && !allowed.has(`[${host}]`))
      return errorResponse(c, 403, [{ path: "host", message: `"${host}" is not this app` }]);
    const origin = c.req.header("origin");
    if (origin !== undefined) {
      let originHost: string | undefined;
      try {
        originHost = new URL(origin).hostname;
      } catch {
        originHost = undefined;
      }
      if (originHost === undefined || !allowed.has(originHost))
        return errorResponse(c, 403, [{ path: "origin", message: `"${origin}" is not this app` }]);
    }
    if (["POST", "PUT", "PATCH"].includes(c.req.method)) {
      const type = c.req.header("content-type") ?? "";
      if (!/^application\/json\b/i.test(type))
        return errorResponse(c, 415, [
          { path: "content-type", message: "must be application/json" },
        ]);
    }
    return next();
  };
  const limit = (bytes: number) =>
    bodyLimit({
      maxSize: bytes,
      onError: (c) =>
        errorResponse(c, 413, [
          { path: "(body)", message: `larger than ${bytes / 1024 / 1024} MB` },
        ]),
    });
  app.use("/api/*", guard, limit(MAX_API_BYTES));
  app.use("/mcp", guard, limit(MAX_MCP_BYTES));

  // MCP over Streamable HTTP, without sessions: each request gets a fresh server on the
  // shared projects and events, and answers with JSON. Preview links use the address the
  // client reached the app on, which is the one its user's browser can open.
  app.on(["GET", "DELETE"], "/mcp", (c) =>
    errorResponse(c, 405, [
      {
        path: "method",
        message: "this MCP endpoint keeps no sessions: send each request as a POST",
      },
    ]),
  );
  app.post("/mcp", async (c) => {
    const origin = publicUrl ? new URL(publicUrl).origin : new URL(c.req.url).origin;
    const server = createMcpServer({
      projectsDir,
      now,
      events,
      renders,
      previewUrl: (slug) => `${origin}/#/projects/${slug}`,
    });
    // No sessionIdGenerator: the transport is stateless.
    const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
    await server.connect(transport);
    return transport.handleRequest(c.req.raw);
  });

  app.get("/api/projects", async (c) => c.json(await listProjects(projectsDir)));

  app.post("/api/projects", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return errorResponse(c, 400, [{ path: "(body)", message: "not valid JSON" }]);
    }
    const created = await createProject(projectsDir, body, now());
    if (!created.ok) return errorResponse(c, 400, created.errors);
    events.publish({ type: "project-created", slug: created.value.slug });
    return c.json(created.value, 201);
  });

  app.get("/api/projects/:slug", async (c) => {
    const slug = c.req.param("slug");
    const opened = await openProject(projectsDir, slug);
    if (!opened) return errorResponse(c, 404, [{ path: "slug", message: `no project "${slug}"` }]);
    if (!opened.ok) return errorResponse(c, 422, opened.errors);
    return c.json(opened.value);
  });

  app.get("/api/events", (c) =>
    streamSSE(c, async (stream) => {
      const unsubscribe = events.subscribe((event) => {
        void stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
      });
      stream.onAbort(unsubscribe);
      await stream.writeSSE({ event: "ready", data: "{}" });
      while (!stream.aborted) {
        await stream.sleep(KEEP_ALIVE_MS);
        if (!stream.aborted) await stream.write(": keep-alive\n\n");
      }
    }),
  );

  // Last, so only paths no route above took land here, with any method.
  app.all("/api", (c) => errorResponse(c, 404, [{ path: "url", message: "no such API" }]));
  app.all("/api/*", (c) => errorResponse(c, 404, [{ path: "url", message: "no such API" }]));

  return app;
};
