import type { z } from "zod";
import type { Validated } from "../schema/errors.ts";
import type { LlmAskedSchema, LlmReply, LlmTurnAskedSchema, LlmTurnReply } from "../schema/llm.ts";

/**
 * The port to an LLM (AGENTS.md, Ports): one structured call, answered with
 * the model's text. The provider client calls a real endpoint; the fixtures
 * replay recorded answers, and tests use a fake. Checking the text against
 * a schema, and asking again when it does not fit, is the repair loop's work.
 */

export type LlmRequest = z.output<typeof LlmAskedSchema> & {
  /** What the call is for, such as "graph": it names its fixtures. */
  readonly name: string;
};

/** One step of an agent: the conversation so far and the tools on offer. */
export type LlmTurnRequest = z.output<typeof LlmTurnAskedSchema> & {
  /** What the conversation is, such as "chat-reset": it names its fixtures. */
  readonly name: string;
};

export type LlmClient = {
  /** The model's answer, or why the endpoint could not give one, named plainly. */
  readonly generate: (request: LlmRequest) => Promise<Validated<LlmReply>>;
  /** One step of an agent: the model's text and the tools it calls, which the caller runs. */
  readonly converse: (request: LlmTurnRequest) => Promise<Validated<LlmTurnReply>>;
};
