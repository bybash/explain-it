import { z } from "zod";
import { graphSummary, storyboardSummary } from "../guidance/guide.ts";
import type { AgentTool } from "../llm/agent.ts";
import { formatErrors, type Validated } from "../schema/errors.ts";
import { GraphSchema } from "../schema/graph.ts";
import { JsonPatchSchema } from "../schema/mcp.ts";
import { GATES } from "../schema/project.ts";
import { RenderRequestSchema } from "../schema/render.ts";
import { BriefSchema } from "../schema/story.ts";
import { StoryboardSchema } from "../schema/storyboard.ts";
import { approveGate } from "../server/gates.ts";
import { checkTool, renderStatusTool, renderTool } from "./render-tools.ts";
import {
  getProjectTool,
  setBriefTool,
  setStoryboardTool,
  setStyleTool,
  type ToolContext,
  updateGraphTool,
} from "./tools.ts";

/** The names of the in-app assistant's tools; the chat names its step lines by them. */
export const AGENT_TOOL_NAMES = {
  getProject: "get_project",
  updateGraph: "update_graph",
  setBrief: "set_brief",
  setStoryboard: "set_storyboard",
  setStyle: "set_style",
  approveGate: "approve_gate",
  check: "check",
  render: "render",
  renderStatus: "render_status",
} as const;
const T = AGENT_TOOL_NAMES;

/** Fields the in-app agent never needs: links into the app it is in, and times that change on every run. */
const NOT_FOR_THE_AGENT = new Set(["preview", "createdAt", "updatedAt"]);

/** A tool's result with those fields taken out, at any depth. */
const forTheAgent = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(forTheAgent);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !NOT_FOR_THE_AGENT.has(key))
      .map(([key, v]) => [key, forTheAgent(v)]),
  );
};

/** What the model reads back from a tool: its result, or its errors named by place. */
const output = (result: Validated<unknown>): unknown =>
  result.ok ? forTheAgent(result.value) : { errors: formatErrors(result.errors) };

const inputOf = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { io: "input" }) as Record<string, unknown>;

/** The tool's own arguments, with the project's slug, which the in-app agent never names. */
const withSlug = (slug: string, input: unknown) => ({
  ...(input !== null && typeof input === "object" ? input : {}),
  slug,
});

/**
 * The in-app assistant's tools (SPEC, LLM: the assistant): the MCP tools,
 * called in-process on the project the chat belongs to, so the app and an
 * IDE's agent do the same things, plus `approve_gate`, which only the app
 * has: in the IDE, approval stays in its chat. Results leave out links and
 * times, which the agent has no use for, so a recorded conversation replays
 * exactly.
 */
export const agentTools = (context: ToolContext, slug: string): AgentTool[] => [
  {
    name: T.getProject,
    description:
      "Reads the project: its gate, graph.json, storyboard.json, brief.json, config.json, any broken files, the user's house rules, and the graph as Mermaid.",
    inputSchema: inputOf(z.strictObject({})),
    run: async () => output(await getProjectTool(context, { slug })),
  },
  {
    name: T.updateGraph,
    description: `Saves the project's graph.json: the whole graph in \`graph\`, or an RFC 6902 JSON Patch in \`patch\`. Lays it out, and returns the Mermaid and the beats the change made stale. ${graphSummary()}`,
    inputSchema: inputOf(
      z.strictObject({ graph: GraphSchema.optional(), patch: JsonPatchSchema.optional() }),
    ),
    run: async (input) => output(await updateGraphTool(context, withSlug(slug, input))),
  },
  {
    name: T.setBrief,
    description:
      "Saves the story brief, brief.json, replacing the one before: who the video is for, the one thing to remember, its shape, its hook, and notes. Agree it with the user first.",
    inputSchema: inputOf(z.strictObject({ brief: BriefSchema })),
    run: async (input) => output(await setBriefTool(context, withSlug(slug, input))),
  },
  {
    name: T.setStoryboard,
    description: `Saves storyboard.json: the whole storyboard in \`storyboard\`, or a JSON Patch in \`patch\`. Returns each scene's length and the beats still stale. ${storyboardSummary()}`,
    inputSchema: inputOf(
      z.strictObject({
        storyboard: StoryboardSchema.optional(),
        patch: JsonPatchSchema.optional(),
      }),
    ),
    run: async (input) => output(await setStoryboardTool(context, withSlug(slug, input))),
  },
  {
    name: T.setStyle,
    description:
      "Merges settings into config.json (theme, font, captions, voice, cards, output): objects merge, null removes a setting, anything else replaces it.",
    inputSchema: inputOf(z.strictObject({ config: z.record(z.string(), z.unknown()) })),
    run: async (input) => output(await setStyleTool(context, withSlug(slug, input))),
  },
  {
    name: T.approveGate,
    description: `Approves the gate the project is at (${GATES.join(", ")}) and moves it to the next. Call it only after the user has said, in this conversation, that they approve what that gate shows; never on your own.`,
    inputSchema: inputOf(z.strictObject({ gate: z.enum(GATES) })),
    run: async (input) => {
      const asked = z.strictObject({ gate: z.enum(GATES) }).safeParse(input);
      if (!asked.success) return { errors: [`gate: one of ${GATES.join(", ")}`] };
      const approval = await approveGate(context.projectsDir, slug, asked.data.gate, context.now());
      if (approval.kind === "approved") {
        context.events.publish({ type: "project-updated", slug });
        return { approved: asked.data.gate, gate: approval.project.gate };
      }
      return approval.kind === "missing"
        ? { errors: [`slug: no project "${slug}"`] }
        : { errors: formatErrors(approval.errors) };
    },
  },
  {
    name: T.check,
    description:
      "Checks that the project can render, makes the narration voice if needed (can take a minute), and runs every check: problems by beat and the loudness of the mix.",
    inputSchema: inputOf(z.strictObject({})),
    run: async () => output(await checkTool(context, { slug })),
  },
  {
    name: T.render,
    description:
      "Queues a render of the project; `theme` and `resolution` default to its style. Returns the job to follow with render_status.",
    inputSchema: inputOf(RenderRequestSchema.omit({ slug: true })),
    run: async (input) => output(await renderTool(context, withSlug(slug, input))),
  },
  {
    name: T.renderStatus,
    description: "Reads a render job by its id: its state and progress, then its files.",
    inputSchema: inputOf(z.strictObject({ job: z.string() })),
    run: async (input) => output(await renderStatusTool(context, input as Record<string, unknown>)),
  },
];
