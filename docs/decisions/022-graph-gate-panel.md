# 022: Graph gate panel

## Context

Slice 3.5 makes the first gate panel: the graph as Mermaid code, with its
diagram, to edit and approve. SPEC's User flow gives the graph gate "Mermaid
code and the rendered diagram" with "edit the Mermaid code" as its direct
edit, and the Mermaid section says the web UI renders Mermaid on the client.

## Decision

- **CodeMirror 6** for the code: line numbers, undo, Tab to indent, and the
  line Mermaid cannot read marked with a line decoration of our own (no lint
  package). `@codemirror/state`, `view` and `commands` (MIT), pinned.
- **Read as typed, saved on purpose.** After a 400 ms pause the code is read
  on the server (`POST /api/projects/:slug/graph/read`, nothing saved) and
  drawn in the browser, so its notes and errors show while editing; an
  answer to older text is dropped. Save (`PUT /api/projects/:slug/graph`)
  writes it. Edits are flagged until saved, and the gate cannot be approved
  while there are any, so an approval never covers a graph that was not
  saved.
- **One way to save a graph.** `saveGraph` (`src/server/graphs.ts`) does
  what MCP's `update_graph` did, and both now call it: the layout again,
  keeping manual positions; the beats the edit touches marked stale; the
  storyboard checked against the new graph.
- **A first graph.** A project with no graph starts from a three-node
  diagram, named after the project when saved.
- **Loaded with the gate.** CodeMirror and Mermaid load with the graph
  gate (`lazy` and a dynamic import), so the rest of the app stays as small
  as it was; `npm run dev` bundles them when it starts, so opening the gate
  does not make Vite reload the page.
- **Changed elsewhere.** If MCP or another tab saves the graph while the
  editor has no edits, the editor follows; with edits, it keeps them and
  says that saving replaces the newer graph.

## Alternatives

- **Saving every edit that reads:** fewer clicks, but each half-typed graph
  would be laid out, mark beats stale and reach MCP's agent.
- **A plain textarea:** no dependency, but no line numbers to find the
  error by.
