import { z } from "zod";

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
