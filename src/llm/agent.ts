import type { Validated } from "../schema/errors.ts";
import type { AgentMessage, LlmToolCall } from "../schema/llm.ts";
import { fail, ok } from "../schema/result.ts";
import type { LlmClient } from "./client.ts";

/** How many steps an agent may take for one message before it must answer. */
export const MAX_AGENT_STEPS = 16;

/** A tool the agent offers the model, and runs when the model calls it. */
export type AgentTool = {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
  /** Runs the call; what it returns goes back to the model as the result. */
  readonly run: (input: unknown) => Promise<unknown>;
};

/** One tool call the agent ran, and what came of it. */
export type AgentStep = { readonly call: LlmToolCall; readonly output: unknown };

/**
 * One turn of an agent (SPEC, LLM: the assistant): the model is asked with
 * the conversation and the tools; each tool it calls is run here, in order,
 * and its result sent back, until it answers with text alone. A call to a
 * tool it does not have is answered with an error it can read. A failed
 * call to the model stops the turn with its reason, and so does a turn
 * that takes more than `MAX_AGENT_STEPS` steps.
 */
export const runAgent = async ({
  client,
  name,
  system,
  history,
  tools,
  onStep,
}: {
  readonly client: LlmClient;
  /** Names the turn's fixtures. */
  readonly name: string;
  readonly system: string;
  /** The conversation so far, ending with the user's new message. */
  readonly history: readonly AgentMessage[];
  readonly tools: readonly AgentTool[];
  /** Told of each tool call once it has run, for the chat to show. */
  readonly onStep?: (step: AgentStep) => void | Promise<void>;
}): Promise<Validated<{ reply: string }>> => {
  const byName = new Map(tools.map((t) => [t.name, t]));
  const offered = tools.map(({ run: _run, ...spec }) => spec);
  const messages: AgentMessage[] = [...history];
  for (let step = 0; step < MAX_AGENT_STEPS; step++) {
    const answer = await client.converse({ name, system, messages: [...messages], tools: offered });
    if (!answer.ok) return answer;
    const { text, toolCalls } = answer.value;
    if (toolCalls.length === 0) return ok({ reply: text });
    messages.push({ role: "assistant", content: text, toolCalls });
    const results = [];
    for (const call of toolCalls) {
      const tool = byName.get(call.name);
      const output = tool
        ? await tool.run(call.input)
        : { error: `no tool "${call.name}"; the tools are: ${[...byName.keys()].join(", ")}` };
      results.push({ id: call.id, name: call.name, output });
      await onStep?.({ call, output });
    }
    messages.push({ role: "tool", results });
  }
  return fail([
    { path: "agent", message: `stopped after ${MAX_AGENT_STEPS} steps without an answer` },
  ]);
};
