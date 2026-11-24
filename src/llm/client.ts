import type { z } from "zod";
import type { Validated } from "../schema/errors.ts";
import type { LlmAskedSchema, LlmReply } from "../schema/llm.ts";

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

export type LlmClient = {
  /** The model's answer, or why the endpoint could not give one, named plainly. */
  readonly generate: (request: LlmRequest) => Promise<Validated<LlmReply>>;
};
