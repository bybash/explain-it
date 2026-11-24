import { z } from "zod";

/** Room for Claude's thinking, which counts toward the output limit, as well as the answer. */
export const CLAUDE_MAX_OUTPUT_TOKENS = 16_000;
/** How many hex digits of a SHA-256 name a recorded call, and stand for a long part of it. */
export const FIXTURE_HASH_LENGTH = 16;

/**
 * What a structured call asks an LLM (SPEC, LLM): the shapes the client
 * sends and the fixtures record, so a recorded call is read back as it was
 * written.
 */

export const LlmMessageSchema = z.strictObject({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

/** A call as asked, without its name: what a fixture keeps and its key is made from. */
export const LlmAskedSchema = z.strictObject({
  system: z.string(),
  messages: z.array(LlmMessageSchema),
  /** The JSON Schema the answer is asked to follow. */
  schema: z.record(z.string(), z.unknown()),
});

/** The model's answer, as text: JSON when it followed the schema, anything when it did not. */
export const LlmReplySchema = z.strictObject({ text: z.string() });

/** A recorded call (`src/llm/fixtures/`): its name, what was asked, and the answer. */
export const LlmFixtureSchema = z.strictObject({
  name: z.string(),
  request: LlmAskedSchema,
  reply: LlmReplySchema,
});

export type LlmMessage = z.output<typeof LlmMessageSchema>;
export type LlmReply = z.output<typeof LlmReplySchema>;

/** A tool the model may call: its name, what it does, and its input as JSON Schema. */
export const LlmToolSchema = z.strictObject({
  name: z.string(),
  description: z.string(),
  inputSchema: z.record(z.string(), z.unknown()),
});

/** A call the model made to a tool, with the id its result answers to. */
export const LlmToolCallSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  input: z.unknown(),
});

/** One message of an agent's conversation: the user's, the model's (with its tool calls), or the tools' results. */
export const AgentMessageSchema = z.discriminatedUnion("role", [
  z.strictObject({ role: z.literal("user"), content: z.string() }),
  z.strictObject({
    role: z.literal("assistant"),
    content: z.string(),
    toolCalls: z.array(LlmToolCallSchema),
  }),
  z.strictObject({
    role: z.literal("tool"),
    results: z.array(z.strictObject({ id: z.string(), name: z.string(), output: z.unknown() })),
  }),
]);

/** One step of an agent, as asked: what a turn fixture keeps and its key is made from. */
export const LlmTurnAskedSchema = z.strictObject({
  system: z.string(),
  messages: z.array(AgentMessageSchema),
  tools: z.array(LlmToolSchema),
});

/** The model's step: what it said, and the tools it called (none when it is done for now). */
export const LlmTurnReplySchema = z.strictObject({
  text: z.string(),
  toolCalls: z.array(LlmToolCallSchema),
});

/** A recorded agent step (`src/llm/fixtures/`). */
export const LlmTurnFixtureSchema = z.strictObject({
  name: z.string(),
  turn: LlmTurnAskedSchema,
  reply: LlmTurnReplySchema,
});

export type LlmTool = z.output<typeof LlmToolSchema>;
export type LlmToolCall = z.output<typeof LlmToolCallSchema>;
export type AgentMessage = z.output<typeof AgentMessageSchema>;
export type LlmTurnReply = z.output<typeof LlmTurnReplySchema>;
