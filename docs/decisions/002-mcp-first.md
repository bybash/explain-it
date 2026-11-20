# 002: MCP before the in-app LLM

## Context

Explaining a feature from its code was a non-goal: explAIn-it would have
needed its own Git integration and repository understanding. But developers
already work with an IDE agent (Claude Code, Cursor and others) that has read
their repository and has an LLM.

## Decision

- The running app serves an MCP endpoint at `127.0.0.1:3000/mcp` (Streamable
  HTTP), sharing projects, previews and the render queue with the web app.
- In MCP mode explAIn-it makes no LLM calls. The IDE's agent writes the graph
  and storyboard through tools; the server validates, lays out, checks,
  previews and renders.
- Authoring guidance ships as an MCP prompt (`explain_flow`) and in tool
  descriptions, from one source that the in-app LLM prompts also use.
- Approval happens in the IDE chat, with a preview link in every tool result.
  The server never blocks a render on approval.
- Projects stay in the server's `projects/` folder. `project.json` records
  optional `sources` (file paths and commits) for a later staleness check.
- MCP is milestone 4, before the in-app LLM (milestone 5): it is the first way
  to make a video end to end, and needs no prompts, repair loops or fixtures.
- **Update, after milestone 1:** MCP also comes before audio (milestone 2) and
  most of the web app. Only 3.1 (the server it runs on) comes first. The
  engine already renders a complete silent video with captions, title and
  end cards, so MCP reaches a finished video from the IDE in five slices,
  while the web app needs all of milestone 3 and the LLM. Audio follows MCP,
  and the MCP slices list what they leave for it under Carried over.

## Alternatives considered

- A separate stdio server started by the IDE: deferred; one process is
  simpler and works the same under Docker.
- Writing projects into the user's repository: deferred; a server in Docker
  cannot see it, and writing to arbitrary paths is risky.
- MCP elicitation for approvals: deferred until clients support it widely.
