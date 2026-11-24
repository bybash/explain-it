import type { LlmTurnReply } from "../schema/llm.ts";
import { fail, ok } from "../schema/result.ts";
import type { LlmClient, LlmRequest, LlmTurnRequest } from "./client.ts";

/**
 * An LLM that answers with the texts given, in turn, and an agent's steps
 * with the `steps` given, and keeps every request it was sent; a reply of
 * `{ error }` is a failed call. For tests only.
 */
export const fakeLlm = (
  replies: readonly (string | { readonly error: string })[],
  steps: readonly (LlmTurnReply | { readonly error: string })[] = [],
) => {
  const asked: LlmRequest[] = [];
  const conversed: LlmTurnRequest[] = [];
  const client: LlmClient = {
    generate: async (request) => {
      const reply = replies[asked.length];
      asked.push(request);
      if (reply === undefined) throw new Error(`the fake LLM has no reply ${asked.length}`);
      return typeof reply === "string"
        ? ok({ text: reply })
        : fail([{ path: "llm", message: reply.error }]);
    },
    converse: async (request) => {
      const step = steps[conversed.length];
      conversed.push(structuredClone(request));
      if (step === undefined) throw new Error(`the fake LLM has no step ${conversed.length}`);
      return "error" in step ? fail([{ path: "llm", message: step.error }]) : ok(step);
    },
  };
  return { client, asked, conversed };
};
