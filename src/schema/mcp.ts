import { z } from "zod";
import { SlugSchema } from "./common.ts";
import { LOGO_CORNERS, LOGO_SHOWS } from "./config.ts";
import { ProjectSchema } from "./project.ts";
import { JobIdSchema, RenderRequestSchema } from "./render.ts";

/**
 * The MCP tools' arguments. The documents they carry (graph, storyboard,
 * config) are checked by their own schemas inside the tools, so an error
 * names the place in the document: `graph.nodes[2].kind: …`.
 */

/** Where the app serves MCP; IDE configs point at it. */
export const MCP_PATH = "/mcp";

/** The MCP prompts, by name. */
export const PROMPT_NAMES = {
  explainFlow: "explain_flow",
  explainChange: "explain_change",
} as const;

/** The MCP tools, by name: the server registers them and the guide refers to them. */
export const TOOL_NAMES = {
  getGuide: "get_guide",
  listProjects: "list_projects",
  getProject: "get_project",
  createProject: "create_project",
  updateGraph: "update_graph",
  setBrief: "set_brief",
  setStoryboard: "set_storyboard",
  setStyle: "set_style",
  check: "check",
  render: "render",
  renderStatus: "render_status",
  cancelRender: "cancel_render",
  explainChange: "explain_change",
} as const;

/** A document argument: anything here, checked by its schema in the tool; but it must be there. */
const document = (what: string) =>
  z
    .unknown()
    .refine((value) => value !== undefined, { error: "required" })
    .describe(what);

/** An RFC 6902 JSON Patch: a list of steps applied in order to the current document. */
export const JsonPatchSchema = z
  .array(
    z.object({
      op: z.enum(["add", "remove", "replace", "move", "copy", "test"]),
      path: z.string().describe('A JSON Pointer, such as "/nodes/2/label".'),
      value: z.unknown().optional(),
      from: z.string().optional(),
    }),
  )
  .describe("An RFC 6902 JSON Patch applied to the current file.");

export const ListProjectsArgsSchema = z.strictObject({});
export const GetGuideArgsSchema = z.strictObject({});

export const GetProjectArgsSchema = z.strictObject({ slug: SlugSchema });
export const ExplainChangeArgsSchema = z.strictObject({
  slug: SlugSchema,
  video_url: z
    .url({ protocol: /^https?$/ })
    .optional()
    .describe(
      "Where the video was put for others to watch, such as an attachment on the pull request; the summary links it.",
    ),
});

export const CreateProjectArgsSchema = z.strictObject({
  name: ProjectSchema.shape.name
    .optional()
    .describe("The project's name; the graph's title by default."),
  graph: document("The whole graph.json."),
  sources: ProjectSchema.shape.sources.describe(
    "Files in your repository that the video explains, with their commit.",
  ),
});

/** Exactly one of the whole file or a patch; the tool says which is missing or doubled. */
export const UpdateGraphArgsSchema = z.strictObject({
  slug: SlugSchema,
  graph: z.unknown().optional().describe("The whole new graph.json."),
  patch: JsonPatchSchema.optional(),
});

export const SetBriefArgsSchema = z.strictObject({
  slug: SlugSchema,
  brief: document("The whole brief.json: it replaces the one before."),
});

export const SetStoryboardArgsSchema = z.strictObject({
  slug: SlugSchema,
  storyboard: z.unknown().optional().describe("The whole new storyboard.json."),
  patch: JsonPatchSchema.optional(),
});

const LogoSourceSchema = z.union([
  z.strictObject({
    path: z.string().min(1).describe("An absolute path to a .png, .jpg, .jpeg or .svg file."),
  }),
  z.strictObject({ dataUrl: z.string().describe("The image as a base64 data URL.") }),
]);

export const SetStyleArgsSchema = z.strictObject({
  slug: SlugSchema,
  config: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Settings merged into config.json: objects merge, everything else replaces."),
  logo: z
    .strictObject({
      light: LogoSourceSchema.optional(),
      dark: LogoSourceSchema.optional(),
      corner: z.enum(LOGO_CORNERS).optional(),
      show: z.enum(LOGO_SHOWS).optional(),
    })
    .optional()
    .describe("A logo to copy into the project's assets/, for light and dark."),
});

export const CheckArgsSchema = z.strictObject({ slug: SlugSchema });

/** \`render\`: what to render (see \`render.ts\`). */
export const RenderArgsSchema = RenderRequestSchema;

/** \`render_status\` and \`cancel_render\`: the job id \`render\` returned. */
export const RenderJobArgsSchema = z.strictObject({ job: JobIdSchema });
