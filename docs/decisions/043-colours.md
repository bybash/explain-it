# 043: Colours for nodes, edges and areas

## Context

A user asked how to change the colour of a node, an edge or an area: the
app had no control for it. `graph.json` already has a `category` on each
(`accent`, `muted`, `c1` to `c6`), which the engine draws in the palette's
colour, and agents could set it. But nothing in the app set it, an agent
could not tell which category is green, and changing one marked every beat
that named the node stale.

## Decision

- **A Colours tab in the Style gate**, beside Look and Sound. It lists the
  nodes, edges and areas, each with the palette's swatches; the default (a
  node's kind's colour, or the accent) carries a dot, and picking it gives
  the default back. A node's row can give its colour to every node of its
  kind. The preview draws the picks before they are saved; the Style gate's
  one Save saves them with the style.
- **Categories, never hex.** A pick is a category, so it follows the
  palette in light and dark, and a change of palette recolours everything
  consistently. A colour of one's own belongs in a custom palette (the
  palette editor, in Later), which then says what each category looks like.
- **Saved in `graph.json`, by a route of its own.** `PUT
  /api/projects/:slug/colours` takes `{ nodes, edges, zones }`, each an id to
  a category or null, and writes only the categories: nothing is laid out
  again. The category stays where agents and the Mermaid round-trip already
  keep it; a `colours` map in `config.json` would be a second place to name
  a node's colour.
- **A change of colour marks no beat stale**, from the tab, `update_graph` or
  the chat's `edit_graph`: no line depends on it.
- **Agents see the colours.** `get_project` returns `colours`, each
  category's light and dark colour in the project's palette, and the chat's
  graph edits get the same list in their prompt, so "make the identity
  provider pink" finds `c4`. The guide says so.

## Alternatives

- **Colours in `config.json`.** Purely style, but a node's colour could then
  be named in two files that disagree.
- **Through the style save** (`set_style` taking colours). One request, but
  a style save would write two files.
- **A `set_colours` MCP tool.** Smaller than `update_graph` for an agent,
  but more surface; `update_graph` with a JSON Patch already does it.
- **Free hex colours per node.** Exact, but each would need a dark variant
  and would ignore the palette.
