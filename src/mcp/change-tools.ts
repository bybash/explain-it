import { join } from "node:path";
import { changeSummary } from "../guidance/change-summary.ts";
import { rendersIn } from "../render/renders.ts";
import { parseWith } from "../schema/errors.ts";
import { ExplainChangeArgsSchema, TOOL_NAMES } from "../schema/mcp.ts";
import { fail, ok } from "../schema/result.ts";
import { openProject, projectDir } from "../server/projects.ts";
import type { ToolContext } from "./tools.ts";

type Args = Readonly<Record<string, unknown>>;

/**
 * The `explain_change` tool (decision 051): a project's summary to post where
 * a change is discussed, made from its script and linking `video_url` when
 * given, and the newest render's video and poster on this machine (light
 * first), or null before one is made. A local path is never linked: no one
 * the summary is posted to could open it.
 */
export const explainChangeTool = async (context: ToolContext, input: Args) => {
  const args = parseWith(ExplainChangeArgsSchema, input);
  if (!args.ok) return args;
  const { slug } = args.value;
  const opened = await openProject(context.projectsDir, slug);
  if (!opened) return fail([{ path: "slug", message: `no project "${slug}"` }]);
  if (!opened.ok) return opened;
  const { project, storyboard, brief } = opened.value;
  if (!storyboard)
    return fail([
      {
        path: "storyboard",
        message: `there is no script yet: write it with ${TOOL_NAMES.setStoryboard} first`,
      },
    ]);
  const dir = projectDir(context.projectsDir, slug);
  const [newest] = await rendersIn(dir);
  const fileOf = (file: "video" | "poster") => {
    const found = (newest?.files ?? []).filter((f) => f.file === file);
    const chosen = found.find((f) => f.theme === "light") ?? found[0];
    return newest && chosen ? join(dir, "out", newest.stamp, chosen.theme, chosen.name) : null;
  };
  return ok({
    summary: changeSummary({
      name: project.name,
      storyboard,
      brief,
      sources: project.sources,
      video: args.value.video_url,
    }),
    video: fileOf("video"),
    poster: fileOf("poster"),
    preview: context.previewUrl(slug),
  });
};
