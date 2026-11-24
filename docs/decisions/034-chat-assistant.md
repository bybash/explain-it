# 034: The chat assistant

## Context

Slice 5.7 makes the chat on the left do the work (decision 031): the
in-app LLM, with the user's key, drafts and edits the project through the
gates. Its "Done when" is a described flow reaching an approved graph and
script through tools alone, replayed from recorded answers with no key.

## Decision

- **Our own step loop** (`runAgent`, `src/llm/agent.ts`). Each step is one
  call to the LLM port, `converse`: the conversation and the tools in, the
  model's text and the tools it calls out. The loop runs the calls and feeds
  the results back until the model answers with text, at most 16 steps.
  Every step goes through the same fixtures as a structured call, so a whole
  conversation replays with no key. The AI SDK's own agent would run the
  tools itself, out of reach of the recordings.
- **The MCP tools, in-process** (`agentTools`, `src/mcp/agent-tools.ts`),
  bound to the chat's project, so the app and an IDE's agent do the same
  things. Results leave out preview links and times, which the agent has no
  use for and which change between runs.
- **`approve_gate`, in the app only.** The agent may call it when the user
  approves a gate in their last message; the button still works. In the
  IDE, approval stays in its chat, as before.
- **Live step lines.** A message starts a turn in the background; each
  change adds a line to `chat.jsonl` (`kind: "step"`), shown but not fed
  back to the model, and the reply comes last. Each line is announced over
  the server events, so the chat and the panel follow along. One turn at a
  time per project.
- **No key, no surprise.** Without a key, or with one refused, the reply
  says why and points at the panel and Settings.
- **The recorded conversation** (`src/server/assistant-conversation.ts`):
  four messages on a password-reset flow, with a fixed clock and a voice
  that never speaks. Recorded with `anthropic/claude-haiku-5.5` over
  OpenRouter, it drafted the graph, proposed the story, saved the brief and
  the script, and approved both gates, in eleven steps. Agent-step fixtures
  keep only hashes of the system prompt and the tools, which repeat on
  every step.

## Alternatives

- **The AI SDK's tool loop agent.** Less code, but its steps cannot be
  recorded and replayed with ours.
- **Approval by button only.** Safer, but the conversation could not move
  the project on, and the user would switch between chat and panel at
  every gate.
- **Waiting for the whole reply.** Simpler, but a minute of nothing, and a
  request the browser may give up on.
