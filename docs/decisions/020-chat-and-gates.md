# 020: Chat and gates

## Context

Slice 3.3 makes the gate stepper real and adds the chat column, before the
LLM exists. SPEC says the user approves a gate "by chat or by button" and
"can go back to any gate", and that `project.json` holds the current gate.

## Decision

- **`project.json` keeps the furthest gate reached.** Going back is a view:
  the address names the gate shown (`#/projects/<slug>/<gate>`), and an
  earlier gate stays approved. Any gate up to the one reached can be opened;
  later ones open only by approving. MCP's tools already move the gate
  forward only (`laterGate`), so the two agree.
- **Approving moves on from the gate reached, and only from it.** The request
  names the gate approved, so a second click or an old tab is refused with a
  named error instead of skipping a gate. The graph and script gates need
  `graph.json` and `storyboard.json`, valid; style and preview need nothing,
  and render is the last gate.
- **Chat without an LLM.** Messages go to `chat.jsonl`, one a line, with the
  gate they were sent at. Each gets a stub reply that says the assistant is
  not connected yet and how to go on. A broken line is named by its number
  and the rest still read, and a line a crash left unfinished is ended
  before the next message, so it stays the only broken one. A message needs
  only the project's folder, so a broken `project.json` does not stop the
  conversation about it. Approving by chat waits for the LLM.
- **The first end-to-end test** drives the app in Chrome as `npm start` and as
  `npm run dev`: a named error, creating and opening a project, chat that
  survives a restart, the list updating over SSE, and approving and going
  back. `npm run dev` now honours `PORT` for its pages and `DEV_API_PORT` for
  the API behind them, so the test runs on ports of its own beside a
  developer's running app.

## Alternatives

- **Moving the gate back when the user goes back:** it would lose how far the
  project got, and MCP would move it forward again on its next edit.
- **Approving by simple phrases in the chat:** rules that the LLM would
  replace, and that could approve a gate the user only mentioned.
