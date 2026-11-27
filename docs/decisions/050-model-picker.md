# 050: The model picker

## Context

The model was a text box on the Settings page: to try Gemini or GPT
instead of Claude, the user had to know the model's id as the endpoint
names it. The user asked for a model selection for the chat, with Claude,
Gemini, GPT and other models that could do the job.

## Decision

- **A list per provider, in `src/schema/settings.ts` (`MODEL_CHOICES`).**
  OpenRouter offers Claude (Sonnet 5.5, Opus 5.5, Fable 5.2, Haiku 5.5),
  Gemini 4 (Carbon, Argon, Neon, Hydrogen), GPT-6 (6.2 Astra, 6.2 Sol, 6
  Luna) and others (Grok 4.7, DeepSeek V4.1 Flash, Mistral Large 4, Qwen4
  Max, Kimi K3.1 Pro). Each takes structured output in OpenRouter's
  catalogue, which every step of the assistant needs. Anthropic's and
  OpenAI's own APIs list their own models by their own ids. A local or custom
  endpoint has no list: its models are its own.
- **Grouped by family, with a few words on each** ("fast and cheap",
  "flagship"), the suggested model first.
- **"Another model…" opens the box**, so any id can still be typed.
- **The chat has the same picker above its message box.** It writes the same
  setting, `LLM_MODEL`, so a pick there or in Settings is one choice, and
  the next message uses it (the client reads the settings on each call). A
  listed model saves as it is picked; a typed one with "Use".
- **A model the environment sets** is shown, and cannot be changed, as before.

## Alternatives

- **The endpoint's own list** (OpenRouter's `/models`): always current, but
  hundreds of models, most unsuited, and a call before the page can show.
- **A model per project or per chat**: a second place a model lives, and a
  new project file field; one setting is enough for now.
- **A model per assistant step** (cheap for checks, strong for drafting):
  possible later, on top of this list.
