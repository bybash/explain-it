import { authoringGuide } from "../guidance/guide.ts";
import { type AgentStep, runAgent } from "../llm/agent.ts";
import type { LlmClient } from "../llm/client.ts";
import { agentTools, AGENT_TOOL_NAMES as T } from "../mcp/agent-tools.ts";
import type { ToolContext } from "../mcp/tools.ts";
import type { ChatMessage } from "../schema/chat.ts";
import type { ContextFile } from "../schema/context.ts";
import type { ValidationError } from "../schema/errors.ts";
import type { AgentMessage } from "../schema/llm.ts";
import type { Gate } from "../schema/project.ts";
import { appendChat, readChat } from "./chat.ts";
import { listContext } from "./context.ts";
import { openProject, projectDir } from "./projects.ts";
import { readHouseRules } from "./stories.ts";

/**
 * What the in-app assistant is told beyond the authoring guide: where it
 * is, that the project exists, and when to stop for the user.
 */
const inTheApp = (slug: string, gate: Gate) => `## In this app

You are the assistant in the explAIn-it web app, working on the project "${slug}", which is at the ${gate} gate. The project already exists, and you work on it only: read it with ${T.getProject} when you need its state.

- Your replies are shown as Markdown. Keep them short.
- After the graph, the story and the script, stop and wait for the user. When they approve the graph or the script, call ${T.approveGate} for that gate, then go on to the next step.
- Never call ${T.approveGate} unless the user approved that gate in their last message.`;

/** The context the user gave, by name and size, for the model to read with its tool; nothing when there is none. */
const contextSection = (files: readonly ContextFile[]) =>
  files.length === 0
    ? []
    : [
        `## Context

The user gave these files for this project. Read the ones that bear on what you are drafting with ${T.readContext} before you draft, and say which you used.

${files.map((f) => `- ${f.name} (${f.chars} characters)`).join("\n")}`,
      ];

/** The conversation for the model: the user's messages and the assistant's replies, without its step lines. */
const historyOf = (messages: readonly ChatMessage[]): AgentMessage[] =>
  messages.flatMap((m): AgentMessage[] => {
    if (m.kind === "step") return [];
    return m.role === "user"
      ? [{ role: "user", content: m.text }]
      : [{ role: "assistant", content: m.text, toolCalls: [] }];
  });

/** The chat's line for each tool that changes the project: when it worked, and when it did not. */
const STEP_LINES: Readonly<Record<string, { readonly done: string; readonly failed: string }>> = {
  [T.draftGraph]: { done: "Drafted the graph.", failed: "Could not draft the graph" },
  [T.updateGraph]: { done: "Saved the graph.", failed: "Could not save the graph" },
  [T.setBrief]: { done: "Saved the story brief.", failed: "Could not save the story brief" },
  [T.setStoryboard]: { done: "Saved the script.", failed: "Could not save the script" },
  [T.setStyle]: { done: "Saved the style.", failed: "Could not save the style" },
  [T.check]: { done: "Ran the checks.", failed: "Could not run the checks" },
  [T.render]: { done: "Started a render.", failed: "Could not start a render" },
  [T.cancelRender]: { done: "Cancelled the render.", failed: "Could not cancel the render" },
};

/** What a tool's result says, as the chat shows it, and whether it worked; nothing for a tool that only reads. */
const stepLine = ({ call, output }: AgentStep): { text: string; failed: boolean } | undefined => {
  const result = (output ?? {}) as { errors?: readonly string[]; approved?: string };
  const problem = result.errors?.[0];
  const failed = problem !== undefined;
  if (call.name === T.approveGate)
    return {
      text: failed
        ? `Could not approve the gate: ${problem}`
        : `Approved the ${result.approved} gate.`,
      failed,
    };
  const line = STEP_LINES[call.name];
  if (!line) return undefined;
  return { text: failed ? `${line.failed}: ${problem}` : line.done, failed };
};

/** The reply when the turn could not finish: what went wrong, and where to look. */
const failed = (errors: readonly ValidationError[]) => {
  // A problem with the LLM itself says so plainly; anything else keeps its place.
  const reasons = errors.map((e) => (e.path === "llm" ? e.message : `${e.path}: ${e.message}`));
  return `I can't answer yet: ${reasons.join("; ")}. Check the LLM in Settings; until then, you can make the video in the panel on the right.`;
};

/**
 * One turn of the in-app assistant (SPEC, LLM: the assistant): it reads the
 * project's chat, which ends with the user's new message, and answers it
 * with the same tools an MCP agent has, on this project. Each change it
 * makes adds a line to the chat as it happens, and its reply comes last;
 * every addition is announced, so the chat and the panel follow along. When
 * there is no LLM to answer (no key, a refused key), the reply says so.
 */
export const runAssistant = async ({
  context,
  client,
  slug,
  gate,
}: {
  readonly context: ToolContext;
  readonly client: LlmClient;
  readonly slug: string;
  /** The gate the user is looking at, which the assistant's lines are saved with. */
  readonly gate: Gate;
}): Promise<void> => {
  const dir = projectDir(context.projectsDir, slug);
  const add = async (text: string, step?: { readonly failed: boolean }) => {
    await appendChat(dir, [
      {
        role: "assistant",
        text,
        gate,
        at: context.now().toISOString(),
        ...(step ? { kind: "step" as const } : {}),
        ...(step?.failed ? { failed: true as const } : {}),
      },
    ]);
    context.events.publish({ type: "chat", slug });
  };
  const houseRules = await readHouseRules(context.projectsDir);
  // The project's own gate: the user may be looking back at an earlier one.
  const opened = await openProject(context.projectsDir, slug);
  const reached = opened?.ok ? opened.value.project.gate : gate;
  const given = await listContext(dir);
  const system = [
    authoringGuide({ where: "app", houseRules: houseRules.ok ? houseRules.value : null }),
    inTheApp(slug, reached),
    ...contextSection(given.files),
  ].join("\n\n");
  const result = await runAgent({
    client,
    name: `chat-${slug}`,
    system,
    history: historyOf((await readChat(dir)).messages),
    tools: agentTools(context, slug, client),
    onStep: async (step) => {
      const line = stepLine(step);
      if (line) await add(line.text, line);
    },
  });
  await add(result.ok ? result.value.reply : failed(result.errors));
};
