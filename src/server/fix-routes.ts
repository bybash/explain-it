import type { Context, Hono } from "hono";
import type { Events } from "./events.ts";
import { fixFromChat } from "./fixes.ts";
import { openProject, withProjectLock } from "./projects.ts";
import { errorResponse, noProject } from "./responses.ts";

/**
 * A fix the chat offers for what the checks found (decision 038), applied,
 * and undone, by the id the chat gave it.
 */
export const fixRoutes = (
  app: Hono,
  { projectsDir, now, events }: { projectsDir: string; now: () => Date; events: Events },
) => {
  const fix = (undo: boolean) => async (c: Context) => {
    const slug = c.req.param("slug") ?? "";
    const id = c.req.param("id") ?? "";
    const result = await withProjectLock(projectsDir, slug, async () => {
      const opened = await openProject(projectsDir, slug);
      if (!opened) return undefined;
      if (!opened.ok) return { kind: "broken" as const, errors: opened.errors };
      return fixFromChat(
        projectsDir,
        opened.value,
        { id, undo, gate: opened.value.project.gate },
        now(),
      );
    });
    if (!result) return noProject(c, slug);
    switch (result.kind) {
      case "broken":
        return errorResponse(c, 422, result.errors);
      case "no-fix":
        return errorResponse(c, 404, [{ path: "id", message: `no fix "${id}" in the chat` }]);
      case "conflict":
        return errorResponse(c, 409, result.errors);
      case "invalid":
        return errorResponse(c, 400, result.errors);
      case "done":
        events.publish({ type: "project-updated", slug });
        events.publish({ type: "chat", slug });
        return c.json(result.message);
    }
  };
  app.post("/api/projects/:slug/fixes/:id", fix(false));
  app.post("/api/projects/:slug/fixes/:id/undo", fix(true));
};
