# 019: LLM settings

## Context

Slice 3.2 adds the settings page. SPEC said only "Settings: base URL, API
key, model", read from `.env` and written by the page, with Docker users
passing `-e OPENROUTER_API_KEY=…`.

## Decision

- **Variables:** `LLM_BASE_URL`, `LLM_MODEL` and `LLM_API_KEY`, which fit
  OpenRouter, OpenAI, Ollama and LM Studio alike. `OPENROUTER_API_KEY` is read
  as the key when `LLM_API_KEY` is not set, so SPEC's Docker line still works.
  Saving a new key writes `LLM_API_KEY` and removes `OPENROUTER_API_KEY` from
  `.env`, so the key written is the key read.
- **The environment wins.** `.env` is never loaded into the process; a
  variable the environment sets is the user's own and wins over the file.
  Each setting is looked up in the environment first, then in `.env`, and
  within one place `LLM_API_KEY` comes before `OPENROUTER_API_KEY`; so
  `-e OPENROUTER_API_KEY` wins over an `LLM_API_KEY` saved in `.env`, as a
  Docker user would expect.
- **One line per value.** The base URL, model and key may not contain spaces
  or line breaks, and the writer escapes line breaks anyway, so no value can
  add a second variable to `.env`. A variable set twice is changed on its
  first line and its later lines are dropped, since the last one is read. The
  page shows it as set by the environment and cannot change it, and the API
  refuses such a change by name.
- **Presets, no live call.** The page offers OpenRouter, OpenAI, Ollama and
  LM Studio by base URL, and any other URL as custom. The model is typed, with
  a suggested default. Nothing calls the provider before the LLM client (5.1)
  exists, so the settings stay testable offline.
- **The key stays on the server.** The API returns only its last four
  characters (none of a key under 12), never logs it, and writes `.env` with
  mode 600 through a temporary file.

## Alternatives

- **`OPENROUTER_API_KEY` as the only key name:** reads oddly for an OpenAI or
  local endpoint.
- **A test-connection button:** useful, but it adds a network path before the
  client that would own it.
