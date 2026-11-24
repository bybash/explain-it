import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { APICallError, generateText, jsonSchema, NoObjectGeneratedError, Output } from "ai";
import type { Validated } from "../schema/errors.ts";
import { fail, ok } from "../schema/result.ts";
import { LOCAL_HOSTS } from "../schema/settings.ts";
import type { LlmClient, LlmReply, LlmRequest } from "./client.ts";

/** What a call needs from Settings: the endpoint, the model, and the key when there is one. */
export type ProviderSettings = {
  readonly baseUrl: string;
  readonly model: string;
  readonly apiKey?: string | undefined;
};

/** Docker's name for the machine it runs on, where Ollama or LM Studio listen. */
const DOCKER_HOST = "host.docker.internal";

/** Whether an endpoint runs on this machine, as Ollama and LM Studio do, and so needs no key. */
const onThisMachine = (hostname: string) =>
  (LOCAL_HOSTS as readonly string[]).includes(hostname) || hostname === DOCKER_HOST;

const llmError = (message: string): Validated<never> => fail([{ path: "llm", message }]);

/** Why a call failed, as the user can act on it (ROADMAP, For 5.1: "the key was refused by openrouter.ai"). */
const said = (error: unknown, host: string, model: string): string => {
  if (APICallError.isInstance(error)) {
    switch (error.statusCode) {
      case 401:
      case 403:
        return `the key was refused by ${host}; check it in Settings`;
      case 402:
        return `${host} refused the call for payment; check the account's credit`;
      case 404:
        return `${host} has no model "${model}", or the base URL is wrong; check both in Settings`;
      case 429:
        return `${host} is limiting calls; wait a moment and try again`;
      case undefined:
        return `could not reach ${host}; is the base URL right, and is it running?`;
      default:
        return `${host} answered ${error.statusCode}: ${error.message}`;
    }
  }
  // A retry wraps the last failure; say that one.
  if (error instanceof Error && "lastError" in error) return said(error.lastError, host, model);
  return `the call to ${host} failed: ${error instanceof Error ? error.message : String(error)}`;
};

/**
 * An LLM client for any OpenAI-compatible endpoint (SPEC, LLM): OpenRouter
 * by default, OpenAI, Ollama or LM Studio. Settings are read on every call,
 * so a key changed in Settings counts at once. The answer comes back as
 * text, even when it is not the JSON asked for: the repair loop answers
 * that. A failed call names its cause plainly, never the key.
 */
export const providerClient = ({
  settings,
  maxRetries,
}: {
  readonly settings: () => Promise<ProviderSettings>;
  /** How often a failed call is tried again; the SDK's default when not given. */
  readonly maxRetries?: number;
}): LlmClient => ({
  generate: async (request: LlmRequest): Promise<Validated<LlmReply>> => {
    const { baseUrl, model, apiKey } = await settings();
    const { hostname } = new URL(baseUrl);
    if (!apiKey && !onThisMachine(hostname))
      return llmError(`no API key for ${hostname}; add one in Settings`);
    const provider = createOpenAICompatible({
      name: "llm",
      baseURL: baseUrl,
      ...(apiKey ? { apiKey } : {}),
      supportsStructuredOutputs: true,
    });
    try {
      const result = await generateText({
        model: provider(model),
        system: request.system,
        messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
        // The schema is checked by the repair loop, with our own errors, so the SDK only asks for it.
        output: Output.object({
          schema: jsonSchema(request.schema as Parameters<typeof jsonSchema>[0]),
        }),
        ...(maxRetries === undefined ? {} : { maxRetries }),
      });
      return ok({ text: result.text });
    } catch (error) {
      // An answer that is not JSON is still an answer: the repair loop asks again.
      if (NoObjectGeneratedError.isInstance(error)) return ok({ text: error.text ?? "" });
      return llmError(said(error, hostname, model));
    }
  },
});
