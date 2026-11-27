import { existsSync } from "node:fs";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CHANGE_GUIDE } from "../guidance/change.ts";
import { graphSummary, storyboardSummary } from "../guidance/guide.ts";
import { RESOLUTIONS, THEME_MODES } from "../schema/config.ts";
import { formatErrors, type Validated } from "../schema/errors.ts";
import {
  CheckArgsSchema,
  CreateProjectArgsSchema,
  ExplainChangeArgsSchema,
  GetGuideArgsSchema,
  GetProjectArgsSchema,
  ListProjectsArgsSchema,
  PROMPT_NAMES,
  RenderArgsSchema,
  RenderJobArgsSchema,
  SetBriefArgsSchema,
  SetStoryboardArgsSchema,
  SetStyleArgsSchema,
  TOOL_NAMES,
  UpdateGraphArgsSchema,
} from "../schema/mcp.ts";
import { RENDER_STATES } from "../schema/render.ts";
import { isSlug } from "../server/projects.ts";
import { VERSION } from "../version.ts";
import { explainChangeTool } from "./change-tools.ts";
import {
  cancelRenderTool,
  checkImages,
  checkTool,
  renderStatusTool,
  renderTool,
} from "./render-tools.ts";
import {
  createProjectTool,
  getProjectTool,
  guideTool,
  listProjectsTool,
  setBriefTool,
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

/** A list of allowed values for a description, from the schema's own list. */
const oneOf = (values: readonly string[]) => values.join(", ");

const TOOLS = [
  {
    name: TOOL_NAMES.getGuide,
    schema: GetGuideArgsSchema,
    run: guideTool,
    text: true,
    description:
      "Returns the guide to making an explAIn-it video: the user's house rules, the steps and when to wait for the user's approval, the exact formats of graph.json and storyboard.json with their limits, how to shape the story and tell it in beats, the style options, and a worked example. Read it before writing a graph or a storyboard.",
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
      "Reads one project by its slug: project.json, graph.json, storyboard.json, brief.json, layout.json and config.json (null when missing), what is wrong with any broken file, the user's house rules for every video (null when none), the graph as Mermaid, and a preview link.",
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
    name: TOOL_NAMES.setBrief,
    schema: SetBriefArgsSchema,
    run: setBriefTool,
    description:
      "Saves a project's story brief, brief.json, replacing the one before: who the video is for (`audience`), the one thing to remember (`takeaway`), its `shape`, its `hook`, and the user's `notes` for this story; every field but `version` is optional. Agree it with the user before writing the storyboard, and follow it when you do. Returns the brief and a preview link.",
  },
  {
    name: TOOL_NAMES.setStoryboard,
    schema: SetStoryboardArgsSchema,
    run: setStoryboardTool,
    description:
      "Replaces a project's storyboard.json with `storyboard`, or applies an RFC 6902 JSON Patch with `patch`. The storyboard is checked against the graph. Returns the length of each scene and of the video (measured from the voice for lines already generated, else estimated; the result says how many of each), the beats still stale, and a preview link. Show the user the script and wait for their approval. " +
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
    images: checkImages,
    description:
      "Checks whether a project can render: every file it needs, read the way the renderer reads it, and Chrome and ffmpeg on this machine. Generates the narration voice for lines not cached yet; the first time, the voice model downloads, so it can take a minute or two. Returns whether it is ready to render, what is missing or broken, the voice (off, ready with its lines, how many were generated or cached and their total seconds, or failed with the reason), the checks (overlaps and anything off the safe area, reading speed and narration fit, by beat, and the loudness of the mix; also written to checks.json in the project folder; they do not stop a render), the contact sheet (one still per beat, beats with warnings outlined; its path, and the small one as an image after the report), the stale beats, the timing measured from the voice, what cannot be checked yet, and a preview link.",
  },
  {
    name: TOOL_NAMES.render,
    schema: RenderArgsSchema,
    run: renderTool,
    description: `Queues a render of a project that is ready (see ${TOOL_NAMES.check}): per theme a video with the narration captions burned in (video.mp4), one without (video-clean.mp4), both with the voice and music, plus the captions (.srt), the soundtrack (audio.wav) and a poster, into the project's out/<time>/ folder. \`theme\` (${oneOf(THEME_MODES)}) and \`resolution\` (${oneOf(RESOLUTIONS)}) default to the project's config when the render starts. Renders run one at a time; returns the job, to follow with ${TOOL_NAMES.renderStatus}.`,
  },
  {
    name: TOOL_NAMES.renderStatus,
    schema: RenderJobArgsSchema,
    run: renderStatusTool,
    description: `Reads a render job by the id ${TOOL_NAMES.render} returned: its state (${oneOf(RENDER_STATES)}), its progress over the whole job, then the paths of the files it wrote, or why it failed.`,
  },
  {
    name: TOOL_NAMES.cancelRender,
    schema: RenderJobArgsSchema,
    run: cancelRenderTool,
    description: "Cancels a queued or running render job by its id, leaving no partial files.",
  },
  {
    name: TOOL_NAMES.explainChange,
    schema: ExplainChangeArgsSchema,
    run: explainChangeTool,
    description:
      "Returns a project's summary as Markdown, to post where a code change is discussed (a pull request, a chat): its name, the one thing to remember, each scene's title and captions, the files it covers, and a link to the video when you pass `video_url`. Also returns the newest render's video and poster paths on this machine (null before a render), for you to attach. It is made from the script, so it says what the video says. Use it after render, as the explain_change prompt describes; post it only when the user says so.",
  },
];

/**
 * An MCP server with explAIn-it's project tools, working on `context`'s
 * projects folder, and the `explain_flow` and `explain_change` prompts.
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
        const content = asContent(result, previewOf(context, args));
        // A tool can show the agent images after its JSON, as check does with the contact sheet.
        if (!("images" in tool) || !result.ok) return content;
        return { ...content, content: [...content.content, ...(await tool.images(result.value))] };
      },
    );
  server.registerPrompt(
    PROMPT_NAMES.explainFlow,
    {
      description:
        "Make an explainer video of a flow with explAIn-it: your house rules, the steps, the file formats, how to shape and tell the story, and when to wait for your approval.",
      argsSchema: {
        topic: z
          .string()
          .optional()
          .describe('What to explain, such as "how login works in this repository".'),
      },
    },
    async ({ topic }) => {
      const read = await guideTool(context);
      // A prompt has no error result of its own; the client shows this message.
      if (!read.ok) throw new Error(formatErrors(read.errors).join("\n"));
      const guide = read.value;
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: topic
                ? `Make an explAIn-it video explaining ${topic}. Follow this guide.\n\n${guide}`
                : guide,
            },
          },
        ],
      };
    },
  );
  server.registerPrompt(
    PROMPT_NAMES.explainChange,
    {
      description:
        "Explain a code change with explAIn-it (decision 051): the parts it touches as the graph, then before, after and what to review as the script, and a summary to post with the video.",
      argsSchema: {
        change: z
          .string()
          .optional()
          .describe('The change to explain, such as "pull request #105" or "this branch".'),
      },
    },
    async ({ change }) => {
      const read = await guideTool(context);
      if (!read.ok) throw new Error(formatErrors(read.errors).join("\n"));
      const opening = `Make an explAIn-it video explaining ${change ?? "this change"}, for the people who review it.`;
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `${opening}\n\n${CHANGE_GUIDE}\n\n${read.value}`,
            },
          },
        ],
      };
    },
  );
  return server;
};
