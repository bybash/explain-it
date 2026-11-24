import { authoringGuide } from "../guidance/guide.ts";
import { type AgentStep, runAgent } from "../llm/agent.ts";
import type { LlmClient } from "../llm/client.ts";
import { agentTools, AGENT_TOOL_NAMES as T } from "../mcp/agent-tools.ts";
import type { ToolContext } from "../mcp/tools.ts";
import type { ChatMessage } from "../schema/chat.ts";
import { formatErrors } from "../schema/errors.ts";
import type { AgentMessage } from "../schema/llm.ts";
import type { Gate } from "../schema/project.ts";
import { appendChat, readChat } from "./chat.ts";
import { projectDir } from "./projects.ts";
import { readHouseRules } from "./stories.ts";

/**
 * What the in-app assistant is told beyond the authoring guide: where it
 * is, that the project exists, and when to stop for the user.
 */
const inTheApp = (slug: string, gate: Gate) => `## In this app

You are the assistant in the explAIn-it web app, working on the project "${slug}", which is at the ${gate} gate. The user sees the project in the panel on the right, and it changes as you save, so do not paste files back: say in a sentence or two what you did, then ask what you need.

- The project already exists: use ${T.updateGraph} to make or change its graph. There is no create_project, list_projects or get_guide here. Read the project with ${T.getProject} when you need its state.
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

/** What a tool's result says, as the chat shows it; nothing for a tool that only reads. */
const stepLine = ({ call, output }: AgentStep): string | undefined => {
  const errors = (output as { errors?: string[] } | null)?.errors;
  const done: Record<string, string> = {
    [T.updateGraph]: "Saved the graph.",
    [T.setBrief]: "Saved the story brief.",
    [T.setStoryboard]: "Saved the script.",
    [T.setStyle]: "Saved the style.",
    [T.check]: "Ran the checks.",
    [T.render]: "Started a render.",
  };
  if (call.name === T.approveGate && !errors)
    return `Approved the ${(output as { approved: string }).approved} gate.`;
  const line = done[call.name];
  if (!line) return undefined;
  return errors
    ? `${line.replace("Saved", "Could not save").replace(".", "")}: ${errors[0]}`
    : line;
};

/** The reply when the turn could not finish: what went wrong, and what still works. */
const failed = (errors: readonly string[]) =>
  `I can't answer yet: ${errors.join("; ").replace(/^llm: /, "")}. Until then, you can make the video in the panel on the right.`;

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
  /** The gate the user is at, which the assistant's lines are saved with. */
  readonly gate: Gate;
}): Promise<void> => {
  const dir = projectDir(context.projectsDir, slug);
  const add = async (text: string, kind?: "step") => {
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
  const system = [
    authoringGuide({ houseRules: houseRules.ok ? houseRules.value : null }),
    inTheApp(slug, gate),
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
  await add(result.ok ? result.value.reply : failed(formatErrors(result.errors)));
};
