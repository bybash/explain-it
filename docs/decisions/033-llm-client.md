# 033: The LLM client

## Context

Slice 5.1 gives the app its LLM client, for the assistant (Milestone 5,
decision 031). The SPEC asks for the Vercel AI SDK, OpenRouter by default
and any OpenAI-compatible endpoint, structured calls, a repair loop of at
most two rounds, and recorded fixtures so that tests and CI need no key.

## Decision

- **Two providers, one client.** The AI SDK's OpenAI-compatible provider
  serves OpenRouter, OpenAI, Ollama and LM Studio. Claude keys go to
  Anthropic's own API through the AI SDK's Anthropic provider: Anthropic's
  OpenAI-compatible endpoint accepts structured output only in strict mode,
  and Anthropic recommends it for testing rather than production. Settings
  gains an "Anthropic (Claude)" preset; each preset suggests a model its API
  knows (`claude-opus-5-5` there, `anthropic/claude-sonnet-5.5` on
  OpenRouter, which is in OpenRouter's model list but was not used for a
  recording). OpenAI and local endpoints suggest none: their models are
  the user's to name.
- **Our validation, not the SDK's.** The client asks for the schema as JSON
  Schema, without strict mode (our schemas have optional fields), and gives
  back the text, JSON or not. `structuredCall` reads it with the zod schema
  and an optional check (references between files), and sends any problems
  back by their place, at most twice. The same error paths the rest of the
  app uses reach the model, as they reach MCP agents. The SPEC's three
  stages (schema, references, checks) are the schema and one `check`: a
  drafting slice composes references and quick checks into it.
- **Plain errors, never the key.** A refused key, no credit, an unknown model or base URL,
  rate limits and an unreachable host each say what to do. An endpoint on
  this machine needs no key; any other does, before a call is made. A key
  an endpoint echoes in its error is wiped before the message goes on.
- **Fixtures keyed by the request.** A hash of the system prompt, messages
  and schema, not the model, names each recording, so a changed prompt can
  never replay an old answer. Failed calls are not recorded.
  `npm run llm:record` records `src/llm/recordings.ts` with the model in
  `.env`; the first recording, with `anthropic/claude-haiku-5.5` over
  OpenRouter, needed one real repair (an edge label over its limit).
- Dependencies: `ai` 7.0.169, `@ai-sdk/openai-compatible` 3.0.90 and
  `@ai-sdk/anthropic` 4.0.102, all Apache-2.0, pinned to one release day.

## Alternatives

- **OpenRouter's own provider.** It adds routing extras, but a second code
  path and dependency for what the OpenAI-compatible one already does.
- **The SDK's schema validation.** Its errors do not name places the way
  ours do, and a failed parse throws instead of feeding the repair loop.
- **Fixtures by test name.** Simpler to read, but a changed prompt would
  silently replay an old answer.
