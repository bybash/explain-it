import { z } from "zod";
import { graphSummary, storyboardSummary } from "../guidance/guide.ts";
import type { AgentTool } from "../llm/agent.ts";
import type { LlmClient } from "../llm/client.ts";
import { type ContextText, draftGraph, draftScript, editFile } from "../llm/drafting.ts";
import { ApproveSchema } from "../schema/api.ts";
import { DEFAULT_CONFIG } from "../schema/config.ts";
import { ReadContextArgsSchema } from "../schema/context.ts";
import {
  DRAFT_TOOL_NAMES,
  DraftArgsSchema,
  EditArgsSchema,
  MAX_QUESTIONS,
} from "../schema/drafts.ts";
import { formatErrors, parseWith, type Validated } from "../schema/errors.ts";
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
import { ok } from "../schema/result.ts";
import { BriefSchema } from "../schema/story.ts";
import { StoryboardSchema } from "../schema/storyboard.ts";
import { readContext } from "../server/context.ts";
import { approveGate } from "../server/gates.ts";
import { openProject, projectDir } from "../server/projects.ts";
import { readHouseRules } from "../server/stories.ts";
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
 * Fields the in-app agent never needs: links into the app it is in, the
 * Mermaid the panel already draws, and times that change on every run.
 */
const NOT_FOR_THE_AGENT = new Set(["preview", "mermaid", "createdAt", "updatedAt"]);

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

/** The context files a draft names, with their text; an error names one that is not there. */
const contextTexts = async (
  dir: string,
  names: readonly string[],
): Promise<Validated<ContextText[]>> => {
  const texts: ContextText[] = [];
  for (const name of names) {
    const text = await readContext(dir, name);
    if (!text.ok) return text;
    texts.push({ name, text: text.value });
  }
  return ok(texts);
};

/** The user's house rules for a draft; none when the file is missing or cannot be read. */
const houseRulesOf = async (context: ToolContext) => {
  const rules = await readHouseRules(context.projectsDir);
  return rules.ok ? rules.value : null;
};

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
 * `read_context` (an IDE's agent reads the repository itself), and
 * and the drafting tools, `draft_graph`, `draft_script`, `edit_graph` and
 * `edit_script`, which draft or edit in one checked call with `client` (an
 * IDE's agent is the LLM, and drafts itself). Results leave out links and
 * times, which the agent has no use for, so a recorded conversation replays
 * exactly.
 */
export const agentTools = (context: ToolContext, slug: string, client: LlmClient): AgentTool[] => [
  {
    name: T.draftGraph,
    description: `Drafts the project's graph.json from the user's description and the context files you name, in one call that checks and repairs its own answer, then saves it as ${T.updateGraph} does. Returns what it assumed and at most ${MAX_QUESTIONS} questions to put to the user. Use it for a new graph, or to start one again; change a graph with ${T.editGraph}.`,
    inputSchema: inputOf(DraftArgsSchema),
    run: async (input) => {
      const asked = parseWith(DraftArgsSchema, input);
      if (!asked.ok) return { errors: formatErrors(asked.errors) };
      const texts = await contextTexts(projectDir(context.projectsDir, slug), asked.value.context);
      if (!texts.ok) return { errors: formatErrors(texts.errors) };
      const drafted = await draftGraph(client, {
        request: asked.value.request,
        context: texts.value,
        houseRules: await houseRulesOf(context),
      });
      if (!drafted.ok) return { errors: formatErrors(drafted.errors) };
      const { graph, assumptions, questions } = drafted.value;
      const saved = await updateGraphTool(context, { slug, graph });
      return saved.ok
        ? { ...(forTheAgent(saved.value) as object), assumptions, questions }
        : output(saved);
    },
  },
  {
    name: T.editGraph,
    description: `Changes the project's graph.json as the user asked ("rename X", "add a retry step"), in one call that writes a JSON Patch, checks it and repairs it, so the rest stays as it was; then saves it as ${T.updateGraph} does. Returns what changed in a sentence, and the beats it made stale.`,
    inputSchema: inputOf(EditArgsSchema),
    run: async (input) => {
      const asked = parseWith(EditArgsSchema, input);
      if (!asked.ok) return { errors: formatErrors(asked.errors) };
      const opened = await openProject(context.projectsDir, slug);
      if (!opened?.ok) return { errors: [`slug: no project "${slug}" to open`] };
      const { graph } = opened.value;
      if (!graph) return { errors: [`graph.json: missing; draft the graph with ${T.draftGraph}`] };
      const edit = await editFile(client, {
        file: "graph",
        request: asked.value.request,
        graph,
        houseRules: await houseRulesOf(context),
      });
      if (!edit.ok) return { errors: formatErrors(edit.errors) };
      const saved = await updateGraphTool(context, { slug, patch: edit.value.patch });
      return saved.ok
        ? { ...(forTheAgent(saved.value) as object), summary: edit.value.summary }
        : output(saved);
    },
  },
  {
    name: T.editScript,
    description: `Changes the project's storyboard.json as the user asked ("shorten beat 3", "add a beat on retries"), in one call that writes a JSON Patch, checks it against the graph and repairs it, so the rest stays as it was; then saves it as ${T.setStoryboard} does. Returns what changed in a sentence, and the video's length.`,
    inputSchema: inputOf(EditArgsSchema),
    run: async (input) => {
      const asked = parseWith(EditArgsSchema, input);
      if (!asked.ok) return { errors: formatErrors(asked.errors) };
      const opened = await openProject(context.projectsDir, slug);
      if (!opened?.ok) return { errors: [`slug: no project "${slug}" to open`] };
      const { graph, storyboard } = opened.value;
      if (!graph || !storyboard)
        return { errors: [`storyboard.json: missing; draft the script with ${T.draftScript}`] };
      const edit = await editFile(client, {
        file: "storyboard",
        request: asked.value.request,
        graph,
        storyboard,
        houseRules: await houseRulesOf(context),
      });
      if (!edit.ok) return { errors: formatErrors(edit.errors) };
      const saved = await setStoryboardTool(context, { slug, patch: edit.value.patch });
      return saved.ok
        ? { ...(forTheAgent(saved.value) as object), summary: edit.value.summary }
        : output(saved);
    },
  },
  {
    name: T.draftScript,
    description: `Drafts the project's storyboard.json for its graph, following its brief (save the brief with ${T.setBrief} first), from the context files you name, in one call that checks its own answer (the graph, the hook, the outcome, the length, one thing per beat, words read and said in time) and repairs it; then saves it as ${T.setStoryboard} does. Returns what it assumed, a title card to suggest, and any problem it could not repair. Change a script with ${T.editScript}.`,
    inputSchema: inputOf(DraftArgsSchema),
    run: async (input) => {
      const asked = parseWith(DraftArgsSchema, input);
      if (!asked.ok) return { errors: formatErrors(asked.errors) };
      const opened = await openProject(context.projectsDir, slug);
      if (!opened?.ok) return { errors: [`slug: no project "${slug}" to open`] };
      const { graph, brief, config } = opened.value;
      if (!graph) return { errors: ["graph.json: missing; draft the graph first"] };
      if (!brief)
        return {
          errors: [
            `brief.json: missing; agree the story with the user, and save it with ${T.setBrief}, first`,
          ],
        };
      const texts = await contextTexts(projectDir(context.projectsDir, slug), asked.value.context);
      if (!texts.ok) return { errors: formatErrors(texts.errors) };
      const drafted = await draftScript(client, {
        request: asked.value.request,
        context: texts.value,
        houseRules: await houseRulesOf(context),
        graph,
        brief,
        config: config ?? DEFAULT_CONFIG,
      });
      if (!drafted.ok) return { errors: formatErrors(drafted.errors) };
      const { draft, remaining } = drafted.value;
      const saved = await setStoryboardTool(context, { slug, storyboard: draft.storyboard });
      if (!saved.ok) return output(saved);
      return {
        ...(forTheAgent(saved.value) as object),
        assumptions: draft.assumptions,
        suggestedTitleCard: draft.titleCard,
        ...(remaining.length ? { notRepaired: formatErrors(remaining) } : {}),
      };
    },
  },
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
