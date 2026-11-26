import type { Context, Hono } from "hono";
import { graphToMermaid } from "../mermaid/generate.ts";
import { type GraphEdit, GraphEditSchema } from "../schema/api.ts";
import { applyColours, parseColourChange } from "../schema/colours.ts";
import { parseWith, type Validated } from "../schema/errors.ts";
import type { Events } from "./events.ts";
import { saveColours, saveGraph } from "./graphs.ts";
import { mermaidToGraph } from "./mermaid.ts";
import { openProject, withProjectLock } from "./projects.ts";
import { errorResponse, jsonBody, noProject } from "./responses.ts";

/** The edited Mermaid in a request's body. */
const graphEdit = async (c: Context): Promise<Validated<GraphEdit>> => {
  const body = await jsonBody(c);
  return body.ok ? parseWith(GraphEditSchema, body.value) : body;
};

/**
 * The graph gate's editor (SPEC, Mermaid): read Mermaid as the user types,
 * without saving it, and save it. Both read it against the graph it edits,
 * and name a new project's first graph after the project. The Style gate's
 * Colours tab saves only the colours (decision 043).
 */
export const graphRoutes = (
  app: Hono,
  { projectsDir, now, events }: { projectsDir: string; now: () => Date; events: Events },
) => {
  app.post("/api/projects/:slug/graph/read", async (c) => {
    const slug = c.req.param("slug");
    const edit = await graphEdit(c);
    if (!edit.ok) return errorResponse(c, 400, edit.errors);
    const opened = await openProject(projectsDir, slug);
    if (!opened) return noProject(c, slug);
    if (!opened.ok) return errorResponse(c, 422, opened.errors);
    const { graph, project } = opened.value;
    const read = await mermaidToGraph(edit.value.mermaid, graph ?? undefined, project.name);
    if (!read.ok) return errorResponse(c, 400, read.errors);
    return c.json(read.value);
  });

  app.put("/api/projects/:slug/graph", async (c) => {
    const slug = c.req.param("slug");
    const edit = await graphEdit(c);
    if (!edit.ok) return errorResponse(c, 400, edit.errors);
    const result = await withProjectLock(projectsDir, slug, async () => {
      const opened = await openProject(projectsDir, slug);
      if (!opened) return { status: 404 as const };
      if (!opened.ok) return { status: 422 as const, errors: opened.errors };
      const before = opened.value;
      const { graph, project } = before;
      const read = await mermaidToGraph(edit.value.mermaid, graph ?? undefined, project.name);
      if (!read.ok) return { status: 400 as const, errors: read.errors };
      // The Mermaid was fine; a graph that cannot be laid out is the project's problem, not the request's.
      const saved = await saveGraph(projectsDir, slug, before, read.value.graph, now());
      if (!saved.ok) return { status: 422 as const, errors: saved.errors };
      return {
        status: 200 as const,
        body: { ...read.value, mermaid: graphToMermaid(read.value.graph), ...saved.value },
      };
    });
    if (result.status === 404) return noProject(c, slug);
    if (result.status !== 200) return errorResponse(c, result.status, result.errors);
    events.publish({ type: "project-updated", slug });
    return c.json(result.body);
  });

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
