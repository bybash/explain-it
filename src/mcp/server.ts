import { existsSync } from "node:fs";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatErrors, type Validated } from "../schema/errors.ts";
import {
  CreateProjectArgsSchema,
  GetProjectArgsSchema,
  ListProjectsArgsSchema,
  SetStoryboardArgsSchema,
  SetStyleArgsSchema,
  UpdateGraphArgsSchema,
} from "../schema/mcp.ts";
import { isSlug } from "../server/projects.ts";
import { VERSION } from "../version.ts";
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
    name: "list_projects",
    schema: ListProjectsArgsSchema,
    run: listProjectsTool,
    description:
      "Lists the explAIn-it projects: each one's slug, name, gate and last update, with a link to preview it in the web app.",
  },
  {
    name: "get_project",
    schema: GetProjectArgsSchema,
    run: getProjectTool,
    description:
      "Reads one project by its slug: project.json, graph.json, storyboard.json, layout.json and config.json (null when missing), what is wrong with any broken file, the graph as Mermaid, and a preview link.",
  },
  {
    name: "create_project",
    schema: CreateProjectArgsSchema,
    run: createProjectTool,
    description:
      "Creates a project from a graph.json (nodes, edges, zones), lays it out, and returns its slug, the graph as Mermaid and a preview link. Show the user the Mermaid and wait for their approval before writing the storyboard. Pass `sources` to record which files of the repository the video explains.",
  },
  {
    name: "update_graph",
    schema: UpdateGraphArgsSchema,
    run: updateGraphTool,
    description:
      "Replaces a project's graph.json with `graph`, or applies an RFC 6902 JSON Patch to it with `patch`; lays it out again keeping manual positions. Returns the Mermaid, the beats the change made stale, and any storyboard lines that no longer fit the graph.",
  },
  {
    name: "set_storyboard",
    schema: SetStoryboardArgsSchema,
    run: setStoryboardTool,
    description:
      "Replaces a project's storyboard.json with `storyboard`, or applies an RFC 6902 JSON Patch with `patch`. The storyboard is checked against the graph. Returns the estimated length of each scene and of the video, the beats still stale, and a preview link.",
  },
  {
    name: "set_style",
    schema: SetStyleArgsSchema,
    run: setStyleTool,
    description:
      "Updates a project's config.json: `config` merges into it (theme, font, captions, output, cards and so on; objects merge, other values replace). `logo` copies a logo for light and dark from an absolute file path or a data URL into the project. Returns the config and a preview link.",
  },
] as const;

/** An MCP server with explAIn-it's project tools, working on `context`'s projects folder. */
export const createMcpServer = (context: ToolContext): McpServer => {
  const server = new McpServer({ name: "explain-it", version: VERSION });
  for (const tool of TOOLS)
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: advertised(tool.schema) },
      async (args: Readonly<Record<string, unknown>>) =>
        asContent(await tool.run(context, args), previewOf(context, args)),
    );
  return server;
};
