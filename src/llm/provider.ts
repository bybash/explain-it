import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  APICallError,
  generateText,
  type JSONValue,
  jsonSchema,
  type LanguageModel,
  type ModelMessage,
  NoObjectGeneratedError,
  Output,
  tool,
} from "ai";
import type { Validated } from "../schema/errors.ts";
import type { AgentMessage, LlmReply, LlmTurnReply } from "../schema/llm.ts";
import { fail, ok } from "../schema/result.ts";
import { ANTHROPIC_HOST, isThisMachine } from "../schema/settings.ts";
import type { LlmClient, LlmRequest, LlmTurnRequest } from "./client.ts";

/** What a call needs from Settings: the endpoint, the model, and the key when there is one. */
export type ProviderSettings = {
  readonly baseUrl: string;
  readonly model: string;
  readonly apiKey?: string | undefined;
};

/** Room for Claude's thinking, which counts toward the output limit, as well as the answer. */
const CLAUDE_MAX_OUTPUT = 16_000;

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
 * by default, OpenAI, Ollama or LM Studio; and Claude's own API, for a key
 * from Anthropic. Settings are read on every call,
 * so a key changed in Settings counts at once. The answer comes back as
 * text, even when it is not the JSON asked for: the repair loop answers
 * that. A failed call names its cause plainly, never the key.
 */
/** A model ready to call, from the settings, or why it cannot be called. */
type Endpoint = {
  readonly model: LanguageModel;
  readonly claude: boolean;
  /** Why a call failed, as the user can act on it, with any echoed key wiped. */
  readonly failed: (error: unknown) => Validated<never>;
};

export const providerClient = ({
  settings,
  maxRetries,
  anthropicHosts = [ANTHROPIC_HOST],
}: {
  readonly settings: () => Promise<ProviderSettings>;
  /** How often a failed call is tried again; the SDK's default when not given. */
  readonly maxRetries?: number;
  /** Hosts called through Claude's own API; tests name their stub. */
  readonly anthropicHosts?: readonly string[];
}): LlmClient => {
  const endpoint = async (): Promise<Validated<Endpoint>> => {
    const { baseUrl, model, apiKey } = await settings();
    const { hostname } = new URL(baseUrl);
    if (!apiKey && !isThisMachine(hostname))
      return llmError(`no API key for ${hostname}; add one in Settings`);
    // Claude's key works with its own API, which has native structured output; every other endpoint speaks OpenAI's.
    const claude = anthropicHosts.includes(hostname);
    return ok({
      claude,
      model: claude
        ? createAnthropic({ baseURL: baseUrl, ...(apiKey ? { apiKey } : {}) })(model)
        : createOpenAICompatible({
            name: "llm",
            baseURL: baseUrl,
            ...(apiKey ? { apiKey } : {}),
            supportsStructuredOutputs: true,
          })(model),
      failed: (error) => {
        // Some endpoints echo the key in their error text; it never goes further than here.
        const reason = said(error, hostname, model);
        return llmError(apiKey ? reason.replaceAll(apiKey, "••••") : reason);
      },
    });
  };
  /** What every call shares: the model, room for Claude's thinking, and the retries. */
  const common = ({ model, claude }: Endpoint) => ({
    model,
    ...(claude ? { maxOutputTokens: CLAUDE_MAX_OUTPUT } : {}),
    ...(maxRetries === undefined ? {} : { maxRetries }),
  });

  return {
    generate: async (request: LlmRequest): Promise<Validated<LlmReply>> => {
      const ready = await endpoint();
      if (!ready.ok) return ready;
      try {
        const result = await generateText({
          ...common(ready.value),
          system: request.system,
          messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
          // The schema is checked by the repair loop, with our own errors, so the SDK only asks for it.
          output: Output.object({
            schema: jsonSchema(request.schema as Parameters<typeof jsonSchema>[0]),
          }),
          // Strict mode wants every field required; ours has optional ones, and the repair loop checks the shape.
          providerOptions: { openaiCompatible: { strictJsonSchema: false } },
        });
        return ok({ text: result.text });
      } catch (error) {
        // An answer that is not JSON is still an answer: the repair loop asks again.
        if (NoObjectGeneratedError.isInstance(error)) return ok({ text: error.text ?? "" });
        return ready.value.failed(error);
      }
    },

    converse: async (request: LlmTurnRequest): Promise<Validated<LlmTurnReply>> => {
      const ready = await endpoint();
      if (!ready.ok) return ready;
      try {
        // Tools without `execute`: the SDK stops at the model's calls, and the agent runs them itself.
        const result = await generateText({
          ...common(ready.value),
          system: request.system,
          messages: request.messages.map(toModelMessage),
          tools: Object.fromEntries(
            request.tools.map((t) => [
              t.name,
              tool({
                description: t.description,
                inputSchema: jsonSchema(t.inputSchema as Parameters<typeof jsonSchema>[0]),
              }),
            ]),
          ),
        });
        return ok({
          text: result.text,
          toolCalls: result.toolCalls.map((call) => ({
            id: call.toolCallId,
            name: call.toolName,
            input: call.input,
          })),
        });
      } catch (error) {
        return ready.value.failed(error);
      }
    },
  };
};

/** One of our agent messages as the SDK's: tool calls and results in its parts. */
const toModelMessage = (message: AgentMessage): ModelMessage => {
  switch (message.role) {
    case "user":
      return { role: "user", content: message.content };
    case "assistant":
      return {
        role: "assistant",
        content: [
          ...(message.content ? [{ type: "text" as const, text: message.content }] : []),
          ...message.toolCalls.map((call) => ({
            type: "tool-call" as const,
            toolCallId: call.id,
            toolName: call.name,
            input: call.input,
          })),
        ],
      };
    case "tool":
      return {
        role: "tool",
        content: message.results.map((result) => ({
          type: "tool-result" as const,
          toolCallId: result.id,
          toolName: result.name,
          output: { type: "json" as const, value: result.output as JSONValue },
        })),
      };
  }
};
