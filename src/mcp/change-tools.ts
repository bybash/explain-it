import { changeSummary } from "../guidance/change-summary.ts";
import { renderFilePath, rendersIn } from "../render/renders.ts";
import { parseWith } from "../schema/errors.ts";
import { ExplainChangeArgsSchema, TOOL_NAMES } from "../schema/mcp.ts";
import { RENDER_FILES } from "../schema/render.ts";
import { fail, ok } from "../schema/result.ts";
import { projectDir } from "../server/projects.ts";
import { openOrFail, type ToolContext } from "./tools.ts";

type Args = Readonly<Record<string, unknown>>;

/**
 * The `explain_change` tool (decision 051): a project's summary to post where
 * a change is discussed, made from its script and linking `video_url` when
 * given (and showing `gif_url`), and the newest render's video, poster, GIF
 * and card on this machine (light first), or null before one is made. A local path is never linked: no one
 * the summary is posted to could open it. `outdated` says the project changed
 * after that render, so the video may not show what the summary says.
 */
export const explainChangeTool = async (context: ToolContext, input: Args) => {
  const args = parseWith(ExplainChangeArgsSchema, input);
  if (!args.ok) return args;
  const { slug } = args.value;
  const opened = await openOrFail(context, slug);
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
  const fileOf = async (file: "video" | "poster" | "gif" | "card") => {
    if (!newest) return null;
    const themes = [
      ...newest.themes.filter((t) => t === "light"),
      ...newest.themes.filter((t) => t !== "light"),
    ];
    for (const theme of themes) {
      const path = await renderFilePath(dir, newest.stamp, theme, RENDER_FILES[file]);
      if (path) return path;
    }
    return null;
  };
  return ok({
    summary: changeSummary({
      name: project.name,
      storyboard,
      brief,
      sources: project.sources,
      videoUrl: args.value.video_url,
      gifUrl: args.value.gif_url,
    }),
    video: await fileOf("video"),
    poster: await fileOf("poster"),
    gif: await fileOf("gif"),
    card: await fileOf("card"),
    outdated: newest !== undefined && newest.createdAt < project.updatedAt,
    preview: context.previewUrl(slug),
  });
};
