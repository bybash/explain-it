import type { Hono } from "hono";
import type { TtsProvider } from "../audio/tts.ts";
import { readCachedVoice } from "../audio/voice.ts";
import type { MeasuredLines } from "../schema/api.ts";
import { DEFAULT_CONFIG } from "../schema/config.ts";
import type { Events } from "./events.ts";
import { openProject, projectDir, withProjectLock } from "./projects.ts";
import { errorResponse, jsonBody, noProject } from "./responses.ts";
import { NO_GRAPH, saveStoryboard } from "./storyboards.ts";

/**
 * The Script gate (SPEC, User flow): the whole storyboard from the beat
 * editor, saved as MCP's `set_storyboard` saves it; and the measured length
 * of each line already spoken, so the editor's hints time a beat as the
 * checks do.
 */
export const storyboardRoutes = (
  app: Hono,
  {
    projectsDir,
    now,
    events,
    tts,
  }: { projectsDir: string; now: () => Date; events: Events; tts: TtsProvider },
) => {
  app.get("/api/projects/:slug/narration", async (c) => {
    const slug = c.req.param("slug");
    const opened = await openProject(projectsDir, slug);
    if (!opened) return noProject(c, slug);
    if (!opened.ok) return errorResponse(c, 422, opened.errors);
    const { storyboard, config } = opened.value;
    const said = new Map(storyboard?.scenes.flatMap((s) => s.beats.map((b) => [b.id, b.say])));
    // Read from the voice cache only: nothing is spoken here.
    const lines = storyboard
      ? await readCachedVoice({
          projectDir: projectDir(projectsDir, slug),
          storyboard,
          voice: (config ?? DEFAULT_CONFIG).voice,
          tts,
        })
      : [];
    // By the words of each line, which is what the cache is keyed by, so an edited line is not mistaken for its old self.
    const measured: MeasuredLines = {
      seconds: Object.fromEntries(
        lines.flatMap((line) => {
          const say = said.get(line.beat);
          return say ? [[say, line.seconds]] : [];
        }),
      ),
    };
    return c.json(measured);
  });

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
