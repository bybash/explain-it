import type { Hono } from "hono";
import { type HouseRulesBody, HouseRulesBodySchema } from "../schema/api.ts";
import { parseWith } from "../schema/errors.ts";
import type { Events } from "./events.ts";
import { openProject, withProjectLock } from "./projects.ts";
import { errorResponse, jsonBody, noProject } from "./responses.ts";
import { readHouseRules, saveBrief, writeHouseRules } from "./stories.ts";

/**
 * The story (SPEC, User flow: Script): a project's brief, saved as MCP's
 * `set_brief` saves it, and the house rules every project follows, which
 * the Settings page reads and writes.
 */
export const storyRoutes = (
  app: Hono,
  { projectsDir, now, events }: { projectsDir: string; now: () => Date; events: Events },
) => {
  app.put("/api/projects/:slug/brief", async (c) => {
    const slug = c.req.param("slug");
    const body = await jsonBody(c);
    if (!body.ok) return errorResponse(c, 400, body.errors);
    const result = await withProjectLock(projectsDir, slug, async () => {
      const opened = await openProject(projectsDir, slug);
      if (!opened) return { status: 404 as const };
      if (!opened.ok) return { status: 422 as const, errors: opened.errors };
      const saved = await saveBrief(projectsDir, opened.value, body.value, now());
      return saved.ok
        ? { status: 200 as const, brief: saved.value }
        : { status: 400 as const, errors: saved.errors };
    });
    if (result.status === 404) return noProject(c, slug);
    if (result.status !== 200) return errorResponse(c, result.status, result.errors);
    events.publish({ type: "project-updated", slug });
    return c.json({ brief: result.brief });
  });

  app.get("/api/house-rules", async (c) => {
    const rules = await readHouseRules(projectsDir);
    if (!rules.ok) return errorResponse(c, 422, rules.errors);
    const body: HouseRulesBody = { text: rules.value ?? "" };
    return c.json(body);
  });

  app.put("/api/house-rules", async (c) => {
    const body = await jsonBody(c);
    if (!body.ok) return errorResponse(c, 400, body.errors);
    const rules = parseWith(HouseRulesBodySchema, body.value);
    if (!rules.ok) return errorResponse(c, 400, rules.errors);
    await writeHouseRules(projectsDir, rules.value.text);
    return c.json(rules.value);
  });
};
