import type { Validated } from "../schema/errors.ts";

/**
 * The port to an LLM (AGENTS.md, Ports): one structured call, answered with
 * the model's text. The provider client calls a real endpoint; the fixtures
 * replay recorded answers, and tests use a fake. Checking the text against
 * a schema, and asking again when it does not fit, is the repair loop's work.
 */

export type LlmMessage = { readonly role: "user" | "assistant"; readonly content: string };

export type LlmRequest = {
  /** What the call is for, such as "graph": it names its fixtures. */
  readonly name: string;
  readonly system: string;
  readonly messages: readonly LlmMessage[];
  /** The JSON Schema the answer is asked to follow. */
  readonly schema: Readonly<Record<string, unknown>>;
};

/** The model's answer, as text: JSON when it followed the schema, anything when it did not. */
export type LlmReply = { readonly text: string };

export type LlmClient = {
  /** The model's answer, or why the endpoint could not give one, named plainly. */
  readonly generate: (request: LlmRequest) => Promise<Validated<LlmReply>>;
};
