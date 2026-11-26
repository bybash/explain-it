# 039: Drafting tools

## Context

Slices 5.3 and 5.4 (ROADMAP). The assistant (5.7) drafted by writing whole
files with the MCP tools, as an IDE's agent does. Nothing checked a draft
before the user saw it, except the schema, and only when the model happened
to fix what a tool sent back.

## Decision

- **A drafting tool per file**, only in the app: `draft_graph` (5.3) and
  `draft_script` (5.4), which waits for an agreed brief. Each
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
- **A script is checked before the user sees it**: against the graph, then
  by the story checks (2.8) and the quick checks, each problem named by its
  place. Within the two repairs it is sent back; when they run out, the last
  script that fits the graph is kept with what is left (`structuredDraft`),
  as a script a second too long is better than none.
- **A narration line read too fast asks for plainer words**, not fewer: its
  captions go at the voice's pace, so the length of its words counts, not
  the length of the line.
- **Discriminated unions are sent as `anyOf`.** Claude's structured output
  refuses `oneOf`, which zod writes for a beat's actions; the answer is still
  checked against the real schema.
- **Edits are patches** (5.5): `edit_graph` and `edit_script` answer what
  the user asked in the chat with a JSON Patch on the current file, applied
  and checked as the file is, and sent back when it breaks it. Drafting
  again would rewrite what the user never asked to change. A patch step's
  value is JSON text in the answer, as structured output takes no field of
  any type (nor an object left open); the code reads it back.
- **Nothing is streamed.** The graph shows in the Graph gate once it is
  saved. Streaming moved to Later: a partial graph draws badly, and the
  saved one arrives within seconds.

## Alternatives

- **Keeping whole-file tools, with the checks in their results.** Less
  code, but whether a draft is repaired would depend on the agent noticing.
- **Streaming the graph as it is written**: each partial answer that parses
  drawn as a preview. Left for later.
