import { categoryColours } from "../engine/theme/categories.ts";
import type { AgentTool } from "../llm/agent.ts";
import type { LlmClient } from "../llm/client.ts";
import { draftGraph, draftScript } from "../llm/drafting.ts";
import { editFile } from "../llm/editing.ts";
import { DEFAULT_CONFIG } from "../schema/config.ts";
import {
  DRAFT_TOOL_NAMES,
  DraftArgsSchema,
  EditArgsSchema,
  MAX_QUESTIONS,
} from "../schema/drafts.ts";
import { formatErrors, parseWith } from "../schema/errors.ts";
import { TOOL_NAMES } from "../schema/mcp.ts";
import { openProject, projectDir } from "../server/projects.ts";
import { contextTexts, houseRulesOf, inputOf, noProject, savedWith } from "./agent-results.ts";
import { setStoryboardTool, type ToolContext, updateGraphTool } from "./tools.ts";

const T = { ...TOOL_NAMES, ...DRAFT_TOOL_NAMES };

/**
 * The assistant's drafting tools (decision 039), which only the app has: an
 * IDE's agent is the LLM, and drafts itself. Each drafts or edits in one
 * checked call with `client`, then saves as the MCP tool for that file does.
 */
export const draftTools = (context: ToolContext, slug: string, client: LlmClient): AgentTool[] => [
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
      return savedWith(saved, { assumptions, questions });
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
      if (!opened?.ok) return noProject(slug);
      const { graph, config } = opened.value;
      if (!graph) return { errors: [`graph.json: missing; draft the graph with ${T.draftGraph}`] };
      const colours = categoryColours((config ?? DEFAULT_CONFIG).theme.palette);
      const edit = await editFile(client, {
        file: "graph",
        request: asked.value.request,
        graph,
        colours: colours.ok ? colours.value : null,
        houseRules: await houseRulesOf(context),
      });
      if (!edit.ok) return { errors: formatErrors(edit.errors) };
      const saved = await updateGraphTool(context, { slug, patch: edit.value.patch });
      return savedWith(saved, { summary: edit.value.summary });
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
      if (!opened?.ok) return noProject(slug);
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
      return savedWith(saved, { summary: edit.value.summary });
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
      if (!opened?.ok) return noProject(slug);
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
      return savedWith(saved, {
        assumptions: draft.assumptions,
        suggestedTitleCard: draft.titleCard,
        ...(remaining.length ? { notRepaired: formatErrors(remaining) } : {}),
      });
    },
  },
];
