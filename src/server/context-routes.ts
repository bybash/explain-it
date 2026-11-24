import type { Hono } from "hono";
import { AddContextSchema } from "../schema/context.ts";
import { parseWith } from "../schema/errors.ts";
import { addContext, listContext, removeContext } from "./context.ts";
import type { Events } from "./events.ts";
import { projectDir, projectExists } from "./projects.ts";
import { errorResponse, jsonBody, noProject } from "./responses.ts";

/**
 * A project's context (SPEC, LLM): the text files the assistant reads when
 * it drafts, added from the chat by upload or paste. Context over the limit
 * is refused (413) with a message that says by how much and what to do.
 */
export const contextRoutes = (
  app: Hono,
  { projectsDir, events }: { projectsDir: string; events: Events },
) => {
  app.get("/api/projects/:slug/context", async (c) => {
    const slug = c.req.param("slug");
    if (!(await projectExists(projectsDir, slug))) return noProject(c, slug);
    return c.json(await listContext(projectDir(projectsDir, slug)));
  });

  app.post("/api/projects/:slug/context", async (c) => {
    const slug = c.req.param("slug");
    if (!(await projectExists(projectsDir, slug))) return noProject(c, slug);
    const body = await jsonBody(c);
    if (!body.ok) return errorResponse(c, 400, body.errors);
    const asked = parseWith(AddContextSchema, body.value);
    if (!asked.ok) return errorResponse(c, 400, asked.errors);
    const added = await addContext(projectDir(projectsDir, slug), asked.value);
    if (!added.ok)
      return errorResponse(c, added.errors[0]?.path === "context" ? 413 : 400, added.errors);
    events.publish({ type: "project-updated", slug });
    return c.json(added.value, 201);
  });

  app.delete("/api/projects/:slug/context/:name", async (c) => {
    const slug = c.req.param("slug");
    if (!(await projectExists(projectsDir, slug))) return noProject(c, slug);
    const dir = projectDir(projectsDir, slug);
    const removed = await removeContext(dir, c.req.param("name"));
    if (!removed.ok) return errorResponse(c, 404, removed.errors);
    events.publish({ type: "project-updated", slug });
    return c.json(await listContext(dir));
  });
};
