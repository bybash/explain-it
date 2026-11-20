import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { createEvents, type Events } from "./events.ts";
import { createProject, listProjects, openProject } from "./projects.ts";

export type AppOptions = {
  /** The folder that holds one folder per project. */
  readonly projectsDir: string;
  /** The clock, passed in so tests can fix it. */
  readonly now: () => Date;
  readonly events?: Events;
};

/** How often an idle event stream sends a comment, so proxies and browsers keep it open. */
const KEEP_ALIVE_MS = 15_000;

/**
 * The API: projects over the folders in `projectsDir`, and server-sent events.
 * Request bodies go through their zod schemas; errors name the field, and the
 * file when it is a project file that is wrong.
 */
export const createApp = ({ projectsDir, now, events = createEvents() }: AppOptions) => {
  const app = new Hono();

  app.get("/api/projects", async (c) => c.json(await listProjects(projectsDir)));

  app.post("/api/projects", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ errors: [{ path: "(body)", message: "not valid JSON" }] }, 400);
    }
    const created = await createProject(projectsDir, body, now());
    if (!created.ok) return c.json({ errors: created.errors }, 400);
    events.publish({ type: "project-created", slug: created.value.slug });
    return c.json(created.value, 201);
  });

  app.get("/api/projects/:slug", async (c) => {
    const slug = c.req.param("slug");
    const opened = await openProject(projectsDir, slug);
    if (!opened)
      return c.json({ errors: [{ path: "slug", message: `no project "${slug}"` }] }, 404);
    if (!opened.ok) return c.json({ errors: opened.errors }, 422);
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

  return app;
};
