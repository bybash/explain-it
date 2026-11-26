import type { Hono } from "hono";
import { applyColours, parseColourChange } from "../schema/colours.ts";
import type { Events } from "./events.ts";
import { saveColours } from "./graphs.ts";
import { openProject, withProjectLock } from "./projects.ts";
import { errorResponse, jsonBody, noProject } from "./responses.ts";

/**
 * The Style gate's Colours tab (decision 043): saves a change of colours,
 * the categories in graph.json and nothing else.
 */
export const colourRoutes = (
  app: Hono,
  { projectsDir, now, events }: { projectsDir: string; now: () => Date; events: Events },
) => {
  app.put("/api/projects/:slug/colours", async (c) => {
    const slug = c.req.param("slug");
    const body = await jsonBody(c);
    if (!body.ok) return errorResponse(c, 400, body.errors);
    const change = parseColourChange(body.value);
    if (!change.ok) return errorResponse(c, 400, change.errors);
    const result = await withProjectLock(projectsDir, slug, async () => {
      const opened = await openProject(projectsDir, slug);
      if (!opened) return { status: 404 as const };
      if (!opened.ok) return { status: 422 as const, errors: opened.errors };
      const { graph } = opened.value;
      if (!graph)
        return {
          status: 409 as const,
          errors: [{ path: "graph.json", message: "missing; there is nothing to colour yet" }],
        };
      const coloured = applyColours(graph, change.value);
      if (!coloured.ok) return { status: 400 as const, errors: coloured.errors };
      await saveColours(projectsDir, slug, opened.value, coloured.value, now());
      return { status: 200 as const, body: { graph: coloured.value } };
    });
    if (result.status === 404) return noProject(c, slug);
    if (result.status !== 200) return errorResponse(c, result.status, result.errors);
    events.publish({ type: "project-updated", slug });
    return c.json(result.body);
  });
};
