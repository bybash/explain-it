import { z } from "zod";
import { graphSummary, storyboardSummary } from "../guidance/guide.ts";
import type { AgentTool } from "../llm/agent.ts";
import type { LlmClient } from "../llm/client.ts";
import { ApproveSchema } from "../schema/api.ts";
import { ReadContextArgsSchema } from "../schema/context.ts";
import { DRAFT_TOOL_NAMES } from "../schema/drafts.ts";
import { formatErrors, parseWith } from "../schema/errors.ts";
import { GraphSchema } from "../schema/graph.ts";
import {
  RenderArgsSchema,
  RenderJobArgsSchema,
  SetBriefArgsSchema,
  SetStoryboardArgsSchema,
  SetStyleArgsSchema,
  UpdateGraphArgsSchema,
} from "../schema/mcp.ts";
import { GATES } from "../schema/project.ts";
import { BriefSchema } from "../schema/story.ts";
import { StoryboardSchema } from "../schema/storyboard.ts";
import { readContext } from "../server/context.ts";
import { approveGate } from "../server/gates.ts";
import { projectDir } from "../server/projects.ts";
import { inputOf, output } from "./agent-results.ts";
import { draftTools } from "./draft-tools.ts";
import { cancelRenderTool, checkTool, renderStatusTool, renderTool } from "./render-tools.ts";
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
  cancelRender: "cancel_render",
  readContext: "read_context",
  ...DRAFT_TOOL_NAMES,
} as const;
const T = AGENT_TOOL_NAMES;

/**
 * An MCP tool's arguments (without the slug, which is the chat's own) with
 * each document in its real shape. The
 * MCP arguments take documents as anything, so the tool names their errors
 * by place; the model is shown the shape to write.
 */
const argsFor = (args: z.ZodObject, documents: Record<string, z.ZodType>) =>
  inputOf(
    args.extend(Object.fromEntries(Object.entries(documents).map(([k, v]) => [k, v.optional()]))),
  );

/** The model's input as an object of arguments, as every tool takes. */
const argsOf = (input: unknown): Record<string, unknown> =>
  input !== null && typeof input === "object" ? (input as Record<string, unknown>) : {};

/** The tool's own arguments, with the project's slug, which the in-app agent never names. */
const withSlug = (slug: string, input: unknown) => ({ ...argsOf(input), slug });

/**
 * The in-app assistant's tools (SPEC, LLM: the assistant): the MCP tools,
 * called in-process on the project the chat belongs to, so the app and an
 * IDE's agent do the same things, plus a few only
 * the app has: `approve_gate` (in the IDE, approval stays in its chat),
 * `read_context` (an IDE's agent reads the repository itself), and the
 * drafting tools, `draft_graph`, `draft_script`, `edit_graph` and
 * `edit_script`, which draft or edit in one checked call with `client` (an
 * IDE's agent is the LLM, and drafts itself). Results leave out links and
 * times, which the agent has no use for, so a recorded conversation replays
 * exactly.
 */
export const agentTools = (context: ToolContext, slug: string, client: LlmClient): AgentTool[] => [
  ...draftTools(context, slug, client),
  {
    name: T.getProject,
    description:
      "Reads the project: its gate, graph.json, storyboard.json, brief.json, config.json, any broken files, and the user's house rules.",
    inputSchema: inputOf(z.strictObject({})),
    run: async () => output(await getProjectTool(context, { slug })),
  },
  {
    name: T.updateGraph,
    description: `Saves the project's graph.json: the whole graph in \`graph\`, or an RFC 6902 JSON Patch in \`patch\`. Lays it out, shows it in the panel, and returns the beats the change made stale. ${graphSummary()}`,
    inputSchema: argsFor(UpdateGraphArgsSchema.omit({ slug: true }), { graph: GraphSchema }),
    run: async (input) => output(await updateGraphTool(context, withSlug(slug, input))),
  },
  {
    name: T.setBrief,
    description:
      "Saves the story brief, brief.json, replacing the one before: who the video is for, the one thing to remember, its shape, its hook, and notes. Agree it with the user first.",
    inputSchema: argsFor(SetBriefArgsSchema.omit({ slug: true }), { brief: BriefSchema }),
    run: async (input) => output(await setBriefTool(context, withSlug(slug, input))),
  },
  {
    name: T.setStoryboard,
    description: `Saves storyboard.json: the whole storyboard in \`storyboard\`, or a JSON Patch in \`patch\`. Returns each scene's length and the beats still stale. ${storyboardSummary()}`,
    inputSchema: argsFor(SetStoryboardArgsSchema.omit({ slug: true }), {
      storyboard: StoryboardSchema,
    }),
    run: async (input) => output(await setStoryboardTool(context, withSlug(slug, input))),
  },
  {
    name: T.setStyle,
    description:
      "Merges settings into config.json (theme, font, captions, voice, cards, output): objects merge, null removes a setting, anything else replaces it.",
    // A logo is a file the user gives; the in-app agent sets the rest of the style.
    inputSchema: inputOf(SetStyleArgsSchema.omit({ slug: true, logo: true })),
    run: async (input) => output(await setStyleTool(context, withSlug(slug, input))),
  },
  {
    name: T.approveGate,
    description: `Approves the gate the project is at (${GATES.join(", ")}) and moves it to the next. Call it only after the user has said, in their last message, that they approve what that gate shows; never on your own.`,
    inputSchema: inputOf(ApproveSchema),
    run: async (input) => {
      const asked = parseWith(ApproveSchema, input);
      if (!asked.ok) return { errors: formatErrors(asked.errors) };
      const { gate } = asked.value;
      const approval = await approveGate(context.projectsDir, slug, gate, context.now());
      if (approval.kind === "approved") {
        context.events.publish({ type: "project-updated", slug });
        return { approved: gate, gate: approval.project.gate };
      }
      return approval.kind === "missing"
        ? { errors: [`slug: no project "${slug}"`] }
        : { errors: formatErrors(approval.errors) };
    },
  },
  {
    name: T.readContext,
    description:
      "Reads one of the files of context the user gave for this project (listed under Context in your instructions): notes, a spec, Mermaid or source code. Read what you need before drafting.",
    inputSchema: inputOf(ReadContextArgsSchema),
    run: async (input) => {
      const asked = parseWith(ReadContextArgsSchema, input);
      if (!asked.ok) return { errors: formatErrors(asked.errors) };
      const { name } = asked.value;
      const text = await readContext(projectDir(context.projectsDir, slug), name);
      return text.ok ? { name, text: text.value } : { errors: formatErrors(text.errors) };
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
    inputSchema: inputOf(RenderArgsSchema.omit({ slug: true })),
    run: async (input) => output(await renderTool(context, withSlug(slug, input))),
  },
  {
    name: T.renderStatus,
    description: "Reads a render job by its id: its state and progress, then its files.",
    inputSchema: inputOf(RenderJobArgsSchema),
    run: async (input) => output(await renderStatusTool(context, argsOf(input))),
  },
  {
    name: T.cancelRender,
    description: "Cancels a queued or running render job by its id, leaving no partial files.",
    inputSchema: inputOf(RenderJobArgsSchema),
    run: async (input) => output(await cancelRenderTool(context, argsOf(input))),
  },
];
