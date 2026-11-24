import type { Hono } from "hono";
import type { Events } from "./events.ts";
import { openProject, withProjectLock } from "./projects.ts";
import { errorResponse, jsonBody, noProject } from "./responses.ts";
import { NO_GRAPH, saveStoryboard } from "./storyboards.ts";

/**
 * The Script gate's save (SPEC, User flow): the whole storyboard from the
 * beat editor, saved as MCP's `set_storyboard` saves it.
 */
export const storyboardRoutes = (
  app: Hono,
  { projectsDir, now, events }: { projectsDir: string; now: () => Date; events: Events },
) => {
  app.put("/api/projects/:slug/storyboard", async (c) => {
    const slug = c.req.param("slug");
    const body = await jsonBody(c);
    if (!body.ok) return errorResponse(c, 400, body.errors);
    const result = await withProjectLock(projectsDir, slug, async () => {
      const opened = await openProject(projectsDir, slug);
      if (!opened) return { status: 404 as const };
      if (!opened.ok) return { status: 422 as const, errors: opened.errors };
      if (!opened.value.graph) return { status: 409 as const, errors: [NO_GRAPH] };
      const saved = await saveStoryboard(projectsDir, opened.value, body.value, now());
      return saved.ok
        ? { status: 200 as const, saved: saved.value }
        : { status: 400 as const, errors: saved.errors };
    });
    if (result.status === 404) return noProject(c, slug);
    if (result.status !== 200) return errorResponse(c, result.status, result.errors);
    events.publish({ type: "project-updated", slug });
    return c.json(result.saved);
  });
};
