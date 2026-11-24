import { fail, ok } from "../schema/result.ts";
import type { LlmClient, LlmRequest } from "./client.ts";

/**
 * An LLM that answers with the texts given, in turn, and keeps every request
 * it was sent; a reply of `{ error }` is a failed call. For tests only.
 */
export const fakeLlm = (replies: readonly (string | { readonly error: string })[]) => {
  const asked: LlmRequest[] = [];
  const client: LlmClient = {
    generate: async (request) => {
      const reply = replies[asked.length];
      asked.push(request);
      if (reply === undefined) throw new Error(`the fake LLM has no reply ${asked.length}`);
      return typeof reply === "string"
        ? ok({ text: reply })
        : fail([{ path: "llm", message: reply.error }]);
    },
  };
  return { client, asked };
};
