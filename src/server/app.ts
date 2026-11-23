import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { MiddlewareHandler } from "hono";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { streamSSE } from "hono/streaming";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { TtsProvider } from "../audio/tts.ts";
import { createMcpServer } from "../mcp/server.ts";
import type { ToolContext } from "../mcp/tools.ts";
import { checkProjectFolder } from "../render/check.ts";
import {
  missingRenderTools as findMissingRenderTools,
  type MissingTool,
} from "../render/environment.ts";
import { RenderQueue, type RenderRun } from "../render/queue.ts";
import { renderFromFolder } from "../render/run.ts";
import { ApproveSchema } from "../schema/api.ts";
import { type ChatMessage, NewChatMessageSchema } from "../schema/chat.ts";
import { parseWith, type Validated, type ValidationError } from "../schema/errors.ts";
import { MCP_PATH } from "../schema/mcp.ts";
import { fail, ok } from "../schema/result.ts";
import { appendChat, readChat, STUB_REPLY } from "./chat.ts";
import { createEvents } from "./events.ts";
import { approveGate } from "./gates.ts";
import {
  createProject,
  listProjects,
  openProject,
  projectDir,
  projectExists,
  withProjectLock,
} from "./projects.ts";
import type { SettingsStore } from "./settings.ts";

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
  /** Speaks the narration: Kokoro in the app (see `main.ts`), a fake in tests. */
  readonly tts: TtsProvider;
  /** What a render needs and this machine lacks; probed for real by default. */
  readonly missingRenderTools?: () => Promise<readonly MissingTool[]>;
  /** Runs the layout checks and writes the report; the real ones by default, a fake in tests. */
  readonly runChecks?: ToolContext["runChecks"];
  /** The LLM settings in `.env` (see `main.ts`); tests give each its own file. */
  readonly settings: SettingsStore;
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

/** A request's JSON body, or the error that names why it is not one. */
const jsonBody = async (c: Context): Promise<Validated<unknown>> => {
  try {
    return ok(await c.req.json());
  } catch {
    return fail([{ path: "(body)", message: "not valid JSON" }]);
  }
};

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
  tts,
  renderRun = renderFromFolder(projectsDir, now, tts),
  missingRenderTools = findMissingRenderTools,
  runChecks = (dir, project, lines, skip) =>
    checkProjectFolder({ dir, project, lines, skip, now: now() }),
  settings,
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
  app.use(MCP_PATH, guard, limit(MAX_MCP_BYTES));

  // MCP over Streamable HTTP, without sessions: each request gets a fresh server on the
  // shared projects and events, and answers with JSON. Preview links use the address the
  // client reached the app on, which is the one its user's browser can open.
  app.on(["GET", "DELETE"], MCP_PATH, (c) =>
    errorResponse(c, 405, [
      {
        path: "method",
        message: "this MCP endpoint keeps no sessions: send each request as a POST",
      },
    ]),
  );
  app.post(MCP_PATH, async (c) => {
    const origin = publicUrl ? new URL(publicUrl).origin : new URL(c.req.url).origin;
    const server = createMcpServer({
      projectsDir,
      now,
      events,
      renders,
      missingRenderTools,
      runChecks,
      tts,
      previewUrl: (slug) => `${origin}/#/projects/${slug}`,
    });
    // No sessionIdGenerator: the transport is stateless.
    const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
    await server.connect(transport);
    return transport.handleRequest(c.req.raw);
  });

  app.get("/api/projects", async (c) => c.json(await listProjects(projectsDir)));

  app.post("/api/projects", async (c) => {
    const body = await jsonBody(c);
    if (!body.ok) return errorResponse(c, 400, body.errors);
    const created = await createProject(projectsDir, body.value, now());
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

  // The key goes in and never comes back out: the page sees only its last characters.
  app.get("/api/settings", async (c) => c.json(await settings.view()));

  app.put("/api/settings", async (c) => {
    const body = await jsonBody(c);
    if (!body.ok) return errorResponse(c, 400, body.errors);
    const saved = await settings.update(body.value);
    if (!saved.ok) return errorResponse(c, 400, saved.errors);
    return c.json(saved.value);
  });

  app.get("/api/projects/:slug/chat", async (c) => {
    const slug = c.req.param("slug");
    if (!(await projectExists(projectsDir, slug)))
      return errorResponse(c, 404, [{ path: "slug", message: `no project "${slug}"` }]);
    return c.json(await readChat(projectDir(projectsDir, slug)));
  });

  // Until the LLM arrives, every message gets the same stub reply (SPEC, User flow; Milestone 5).
  app.post("/api/projects/:slug/chat", async (c) => {
    const slug = c.req.param("slug");
    const body = await jsonBody(c);
    if (!body.ok) return errorResponse(c, 400, body.errors);
    const sent = parseWith(NewChatMessageSchema, body.value);
    if (!sent.ok) return errorResponse(c, 400, sent.errors);
    const added = await withProjectLock(projectsDir, slug, async () => {
      const opened = await openProject(projectsDir, slug);
      if (!opened) return undefined;
      const gate = sent.value.gate ?? (opened.ok ? opened.value.project.gate : "graph");
      const at = now().toISOString();
      const messages: ChatMessage[] = [
        { role: "user", text: sent.value.text, at, gate },
        { role: "assistant", text: STUB_REPLY, at, gate },
      ];
      await appendChat(projectDir(projectsDir, slug), messages);
      return messages;
    });
    if (!added) return errorResponse(c, 404, [{ path: "slug", message: `no project "${slug}"` }]);
    events.publish({ type: "chat", slug });
    return c.json({ messages: added }, 201);
  });

  app.post("/api/projects/:slug/approve", async (c) => {
    const slug = c.req.param("slug");
    const body = await jsonBody(c);
    if (!body.ok) return errorResponse(c, 400, body.errors);
    const asked = parseWith(ApproveSchema, body.value);
    if (!asked.ok) return errorResponse(c, 400, asked.errors);
    const approval = await approveGate(projectsDir, slug, asked.value.gate, now());
    switch (approval.kind) {
      case "missing":
        return errorResponse(c, 404, [{ path: "slug", message: `no project "${slug}"` }]);
      case "broken":
        return errorResponse(c, 422, approval.errors);
      case "refused":
        return errorResponse(c, 409, approval.errors);
      case "approved":
        events.publish({ type: "project-updated", slug });
        return c.json({ project: approval.project });
    }
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
