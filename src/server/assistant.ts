import { authoringGuide } from "../guidance/guide.ts";
import { type AgentStep, runAgent } from "../llm/agent.ts";
import type { LlmClient } from "../llm/client.ts";
import { agentTools, AGENT_TOOL_NAMES as T } from "../mcp/agent-tools.ts";
import type { ToolContext } from "../mcp/tools.ts";
import type { ChatMessage } from "../schema/chat.ts";
import type { ValidationError } from "../schema/errors.ts";
import type { AgentMessage } from "../schema/llm.ts";
import type { Gate } from "../schema/project.ts";
import { appendChat, readChat } from "./chat.ts";
import { openProject, projectDir } from "./projects.ts";
import { readHouseRules } from "./stories.ts";

/**
 * What the in-app assistant is told beyond the authoring guide: where it
 * is, that the project exists, and when to stop for the user.
 */
const inTheApp = (slug: string, gate: Gate) => `## In this app

You are the assistant in the explAIn-it web app, working on the project "${slug}", which is at the ${gate} gate. The user sees the project in the panel on the right, and it changes as you save, so do not paste files back: say in a sentence or two what you did, then ask what you need.

- The project already exists: use ${T.updateGraph} to make or change its graph. There is no create_project, list_projects or get_guide here: you work on this project only. Read the project with ${T.getProject} when you need its state.
- Follow the Steps above. Stop and wait for the user's approval in this chat after the graph, after the story, and after the script. When they approve one, call ${T.approveGate} for that gate, then go on to the next step.
- Never call ${T.approveGate} unless the user approved that gate in their last message.
- When a tool gives back errors, fix what they name and call it again.`;

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
  [T.updateGraph]: { done: "Saved the graph.", failed: "Could not save the graph" },
  [T.setBrief]: { done: "Saved the story brief.", failed: "Could not save the story brief" },
  [T.setStoryboard]: { done: "Saved the script.", failed: "Could not save the script" },
  [T.setStyle]: { done: "Saved the style.", failed: "Could not save the style" },
  [T.check]: { done: "Ran the checks.", failed: "Could not run the checks" },
  [T.render]: { done: "Started a render.", failed: "Could not start a render" },
  [T.cancelRender]: { done: "Cancelled the render.", failed: "Could not cancel the render" },
};

/** What a tool's result says, as the chat shows it; nothing for a tool that only reads. */
const stepLine = ({ call, output }: AgentStep): string | undefined => {
  const result = (output ?? {}) as { errors?: readonly string[]; approved?: string };
  const problem = result.errors?.[0];
  if (call.name === T.approveGate)
    return problem
      ? `Could not approve the gate: ${problem}`
      : `Approved the ${result.approved} gate.`;
  const line = STEP_LINES[call.name];
  if (!line) return undefined;
  return problem ? `${line.failed}: ${problem}` : line.done;
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
  const add = async (text: string, kind?: ChatMessage["kind"]) => {
    await appendChat(dir, [
      {
        role: "assistant",
        text,
        gate,
        at: context.now().toISOString(),
        ...(kind ? { kind } : {}),
      },
    ]);
    context.events.publish({ type: "chat", slug });
  };
  const houseRules = await readHouseRules(context.projectsDir);
  // The project's own gate: the user may be looking back at an earlier one.
  const opened = await openProject(context.projectsDir, slug);
  const reached = opened?.ok ? opened.value.project.gate : gate;
  const system = [
    authoringGuide({ houseRules: houseRules.ok ? houseRules.value : null }),
    inTheApp(slug, reached),
  ].join("\n\n");
  const result = await runAgent({
    client,
    name: `chat-${slug}`,
    system,
    history: historyOf((await readChat(dir)).messages),
    tools: agentTools(context, slug),
    onStep: async (step) => {
      const line = stepLine(step);
      if (line) await add(line, "step");
    },
  });
  await add(result.ok ? result.value.reply : failed(result.errors));
};
