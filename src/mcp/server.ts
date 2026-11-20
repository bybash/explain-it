import { existsSync } from "node:fs";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { authoringGuide, graphSummary, storyboardSummary } from "../guidance/guide.ts";
import { formatErrors, type Validated } from "../schema/errors.ts";
import {
  CheckArgsSchema,
  CreateProjectArgsSchema,
  GetGuideArgsSchema,
  GetProjectArgsSchema,
  ListProjectsArgsSchema,
  RenderArgsSchema,
  RenderJobArgsSchema,
  SetStoryboardArgsSchema,
  SetStyleArgsSchema,
  TOOL_NAMES,
  UpdateGraphArgsSchema,
} from "../schema/mcp.ts";
import { isSlug } from "../server/projects.ts";
import { VERSION } from "../version.ts";
import { cancelRenderTool, checkTool, renderStatusTool, renderTool } from "./render-tools.ts";
import {
  createProjectTool,
  getProjectTool,
  listProjectsTool,
  setStoryboardTool,
  setStyleTool,
  type ToolContext,
  updateGraphTool,
} from "./tools.ts";

/**
 * What a tool advertises: its argument names and descriptions, each open to
 * any value. The SDK would otherwise reject bad arguments with messages of
 * its own; the tool checks them with the schemas instead, so every error
 * names its place the same way (`graph.nodes[2].kind: …`). Unknown keys get
 * through too, so the tool can name them.
 */
const advertised = (schema: z.ZodObject) =>
  z.looseObject(
    Object.fromEntries(
      Object.entries(schema.shape).map(([key, field]) => [
        key,
        z
          .unknown()
          .optional()
          .describe((field as z.ZodType).description ?? key),
      ]),
    ),
  );

/**
 * A tool's result as MCP content: its JSON, or its errors one per line. An
 * error about a project ends with its preview link too, so the agent can
 * always point its user at the project (SPEC, MCP: every tool result).
 */
const asContent = (result: Validated<unknown>, preview: string | undefined) => {
  if (result.ok)
    return { content: [{ type: "text" as const, text: JSON.stringify(result.value, null, 2) }] };
  const lines = [...formatErrors(result.errors), ...(preview ? [`preview: ${preview}`] : [])];
  return { isError: true, content: [{ type: "text" as const, text: lines.join("\n") }] };
};

/** The preview link for the project an argument names, when it names one that exists. */
const previewOf = (context: ToolContext, args: Readonly<Record<string, unknown>>) => {
  const { slug } = args;
  return typeof slug === "string" &&
    isSlug(slug) &&
    existsSync(join(context.projectsDir, slug, "project.json"))
    ? context.previewUrl(slug)
    : undefined;
};

const TOOLS = [
  {
    name: TOOL_NAMES.getGuide,
    schema: GetGuideArgsSchema,
    run: async () => ({ ok: true as const, value: authoringGuide() }),
    text: true,
    description:
      "Returns the guide to making an explAIn-it video: the steps and when to wait for the user's approval, the exact formats of graph.json and storyboard.json with their limits, how to tell the story in beats, the style options, and a worked example. Read it before writing a graph or a storyboard.",
  },
  {
    name: TOOL_NAMES.listProjects,
    schema: ListProjectsArgsSchema,
    run: listProjectsTool,
    description:
      "Lists the explAIn-it projects: each one's slug, name, gate and last update, with a link to preview it in the web app.",
  },
  {
    name: TOOL_NAMES.getProject,
    schema: GetProjectArgsSchema,
    run: getProjectTool,
    description:
      "Reads one project by its slug: project.json, graph.json, storyboard.json, layout.json and config.json (null when missing), what is wrong with any broken file, the graph as Mermaid, and a preview link.",
  },
  {
    name: TOOL_NAMES.createProject,
    schema: CreateProjectArgsSchema,
    run: createProjectTool,
    description:
      "Creates a project from a graph.json (nodes, edges, zones), lays it out, and returns its slug, the graph as Mermaid and a preview link. Show the user the Mermaid and wait for their approval before writing the storyboard. Pass `sources` to record which files of the repository the video explains. " +
      graphSummary(),
  },
  {
    name: TOOL_NAMES.updateGraph,
    schema: UpdateGraphArgsSchema,
    run: updateGraphTool,
    description:
      "Replaces a project's graph.json with `graph`, or applies an RFC 6902 JSON Patch to it with `patch`; lays it out again keeping manual positions. Returns the Mermaid, the beats the change made stale, and any storyboard lines that no longer fit the graph. " +
      graphSummary(),
  },
  {
    name: TOOL_NAMES.setStoryboard,
    schema: SetStoryboardArgsSchema,
    run: setStoryboardTool,
    description:
      "Replaces a project's storyboard.json with `storyboard`, or applies an RFC 6902 JSON Patch with `patch`. The storyboard is checked against the graph. Returns the estimated length of each scene and of the video, the beats still stale, and a preview link. Show the user the script and wait for their approval. " +
      storyboardSummary(),
  },
  {
    name: TOOL_NAMES.setStyle,
    schema: SetStyleArgsSchema,
    run: setStyleTool,
    description:
      "Updates a project's config.json: `config` merges into it (theme, font, captions, output, cards and so on; objects merge, other values replace). `logo` copies a logo for light and dark from an absolute file path or a data URL into the project. Returns the config and a preview link.",
  },
  {
    name: TOOL_NAMES.check,
    schema: CheckArgsSchema,
    run: checkTool,
    description:
      "Checks whether a project can render: every file it needs, read the way the renderer reads it. Returns whether it is ready, what is missing or broken, the stale beats, the estimated timing, what cannot be checked yet, and a preview link.",
  },
  {
    name: TOOL_NAMES.render,
    schema: RenderArgsSchema,
    run: renderTool,
    description:
      "Queues a render of a project that is ready (see check): an MP4, its captions (.srt) and a poster per theme, into the project's out/ folder. `theme` (light, dark or both) and `resolution` (1080p or 720p) default to the project's config. Renders run one at a time and take about half a minute per minute of video; returns the job, to follow with render_status.",
  },
  {
    name: TOOL_NAMES.renderStatus,
    schema: RenderJobArgsSchema,
    run: renderStatusTool,
    description:
      "Reads a render job by the id render returned: its state (queued, running, done, failed or cancelled), its progress, then the paths of the files it wrote, or why it failed.",
  },
  {
    name: TOOL_NAMES.cancelRender,
    schema: RenderJobArgsSchema,
    run: cancelRenderTool,
    description: "Cancels a queued or running render job by its id, leaving no partial files.",
  },
];

/**
 * An MCP server with explAIn-it's project tools, working on `context`'s
 * projects folder, and the `explain_flow` prompt.
 */
export const createMcpServer = (context: ToolContext): McpServer => {
  const server = new McpServer({ name: "explain-it", version: VERSION });
  for (const tool of TOOLS)
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: advertised(tool.schema) },
      async (args: Readonly<Record<string, unknown>>) => {
        const result = await tool.run(context, args);
        // The guide is prose for the agent to read, not data, so it goes out as plain text.
        if ("text" in tool && result.ok && typeof result.value === "string")
          return { content: [{ type: "text" as const, text: result.value }] };
        return asContent(result, previewOf(context, args));
      },
    );
  server.registerPrompt(
    "explain_flow",
    {
      description:
        "Make an explainer video of a flow with explAIn-it: the steps, the file formats, how to tell the story, and when to wait for your approval.",
      argsSchema: {
        topic: z
          .string()
          .optional()
          .describe('What to explain, such as "how login works in this repository".'),
      },
    },
    ({ topic }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: topic
              ? `Make an explAIn-it video explaining ${topic}. Follow this guide.\n\n${authoringGuide()}`
              : authoringGuide(),
          },
        },
      ],
    }),
  );
  return server;
};
