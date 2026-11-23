# 021: Mermaid round-trip

## Context

Slice 3.4 reads Mermaid back into the graph, so the graph gate can be edited
as Mermaid. SPEC chose the full `mermaid` package with jsdom on the server,
reading its internal database, and said flowcharts only, subgraphs as zones,
and kind, icon and category kept by id.

## Decision

- **A worker thread.** Mermaid needs a browser's `window` and `document`.
  Set on the server's own thread, they would make transformers.js (the voice)
  take the server for a browser when it loads. So Mermaid runs in a worker
  with jsdom's globals (`src/server/mermaid-worker.ts`), started on first use
  and never holding the process open. What it sends is checked against one
  schema (`MermaidDbSchema`) with no defaults filled in, so a change in
  Mermaid's internal API fails loudly; if the worker stops, every waiting
  parse is told so at once. The worker only reads Mermaid's
  database; pure code (`src/mermaid/mermaid-db.ts`, `src/mermaid/parse.ts`)
  turns it into the graph.
- **Keep what fits, name the rest.** Styling and `click` lines, shapes with no
  kind, line kinds other than a plain arrow and nested subgraphs are kept as
  near as they can be (a service, a plain arrow, a zone of its own) and each
  is named in a note. A diagram that is not a flowchart, or that Mermaid
  cannot read, is an error naming its line. Mermaid counts lines without the
  front matter and `%%{init}%%` directives it takes out, so its
  `loc.first_line` is mapped back to the line as written.
- **Matched by id, and by ends.** Kind comes from the shape; a node named
  without brackets (`a --> db`) keeps its kind, since an edit often names a
  node bare. Icons,
  categories and the node order come from the graph before the edit. An edge
  without an id in the diagram takes the id of the previous edge between the
  same two nodes, so its category and the storyboard's references to it
  survive; a new one is named `<from>_to_<to>`. The front matter's `title:`
  names the graph.
- **Edge ids and keywords.** Node and zone ids already may not be Mermaid
  keywords. Run through the pinned Mermaid, seven keywords also break an edge
  (`end`, `graph`, `flowchart`, `subgraph`, `style`, `class`, `default`), so
  the schema refuses those as edge ids; the rest, like the example's `click`,
  read back fine. A test checks the list against Mermaid itself.
- **Pinned versions.** `mermaid` 12.3.0 (MIT) and `jsdom` 30.1.3 (MIT), with
  `@types/jsdom` 30.0.0 for the types. jsdom's 31 line was days old.

## Alternatives

- **jsdom globals on the server's thread:** simpler, but they change how
  other libraries see the process.
- **Refusing every keyword as an edge id:** one rule for all ids, but it
  would break the example and any project with an edge named `click`.
- **Refusing what does not fit:** strict, but diagrams pasted from docs
  usually carry styling.
