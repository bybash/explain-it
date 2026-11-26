# 039: Drafting tools

## Context

Slices 5.3 and 5.4 (ROADMAP). The assistant (5.7) drafted by writing whole
files with the MCP tools, as an IDE's agent does. Nothing checked a draft
before the user saw it, except the schema, and only when the model happened
to fix what a tool sent back.

## Decision

- **A drafting tool per file**, only in the app: `draft_graph` (5.3). It
  makes one structured call (`structuredCall`, with the repair loop) and
  saves the result as the MCP tool does. The agent still decides when to
  call it and talks to the user; an IDE's agent is the LLM, so it drafts
  itself.
- **Prompts are Markdown** in `src/llm/prompts/`, with `{{places}}` that
  `prompt()` fills; a place left without a value throws. The guide's part on
  the file (`graphGuide()`), with the house rules, fills them, so no limit
  or rule is written twice.
- **A draft says what it assumed**, and asks at most two questions
  (`GraphDraftSchema`): an answer with more is sent back by the repair loop.
- **The tool reads the context files the agent names**, so the drafting
  call sees them whole, without the agent reading them first.
- **Nothing is streamed.** The graph shows in the Graph gate once it is
  saved. Streaming moved to Later: a partial graph draws badly, and the
  saved one arrives within seconds.

## Alternatives

- **Keeping whole-file tools, with the checks in their results.** Less
  code, but whether a draft is repaired would depend on the agent noticing.
- **Streaming the graph as it is written**: each partial answer that parses
  drawn as a preview. Left for later.
