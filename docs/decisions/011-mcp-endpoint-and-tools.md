# 011: MCP endpoint and project tools

## Context

Slice 4.1 lets an IDE's agent make a project end to end over MCP (decision
002). SPEC's tool table named the tools and what they return, but left open
how arguments are checked, how edits are expressed, how the endpoint keeps
state, and what happens when two edits or a broken file get in the way.

## Decision

- **Stateless Streamable HTTP.** Each POST to `/mcp` gets a fresh MCP server
  over the shared projects folder and event hub, and answers with JSON. GET
  and DELETE answer 405: there is no session or stream to open. `/mcp` sits
  behind the API's host and origin checks, with a 4 MB body limit so a 2 MB
  logo fits as base64.
- **Our schemas check the arguments.** Tools advertise their argument names
  and descriptions, each open to any value, and check them with the
  project's zod schemas inside, so errors read `graph.nodes[2].kind: …` like
  the rest of the app instead of the SDK's own messages. 4.2's guidance gives
  agents the shapes up front.
- **Whole files or patches.** The graph and storyboard take a whole file or
  an RFC 6902 JSON Patch (`fast-json-patch`, MIT); a failed step is named by
  its index. Settings merge like a JSON Merge Patch (RFC 7386), so `null`
  removes a card or the logo.
- **The server does the rest.** Graph changes are laid out at once, keeping
  manual positions; the result carries the graph as Mermaid (generated now;
  3.4 adds parsing), the beats the edit made stale and the storyboard lines
  it broke. Storyboards return their estimated timing.
- **Logos are checked wherever they come from:** a path (absolute, since the
  agent's working folder is not the server's), a data URL, or a name in the
  settings, which must already be in `assets/`. A logo that changes type
  replaces its old file.
- **Nothing is lost quietly.** A broken `layout.json` or `config.json` that a
  tool replaces is reported as a warning. Changes to one project run one at
  a time, so two edits at once both land.
- **Gates only move forward** as files arrive. Approval happens in the IDE's
  chat; the server never waits for it.
- **Node and zone ids are not Mermaid keywords** (`end`, `subgraph` and so
  on), so the generated diagram always parses.

## Alternatives considered

- The SDK checking arguments against full schemas: agents would see the
  shapes in the tool list, but errors would read differently from every
  other error in the app. Kept for 4.2 to solve with guidance instead.
- Sessions (stateful Streamable HTTP): resumable streams and server-sent
  notifications, but state to keep and clean up, and nothing in 4.1 needs it.
- Whole files only: simpler, but an agent fixing one caption would resend a
  whole storyboard.
- Our own JSON Patch: no dependency, but a small, well-tested MIT package
  does the same.
- Refusing to touch a broken layout.json: safer for manual positions, but an
  agent cannot repair a file it cannot write through the tools.
