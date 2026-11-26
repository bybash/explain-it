# 032: The Script gate's editor

## Context

Slice 3.6 closes the path by hand (decision 031): without an LLM or an
agent, a script could not be written in the app. Its "Done when" is that
changing a node marks only its beats as stale; the server already did that
(`saveGraph`), and the gate had no panel to show it.

## Decision

- **A form, not JSON.** Scenes and beats as cards: caption, narration, and
  actions whose nodes and edges are picked from the scene's own, so an
  action cannot name what the scene does not show. Beats move up and down,
  are added after another, and removed; scenes are added and removed.
- **A starter script from the graph.** One click makes one scene with the
  graph's nodes, a beat for each edge that shows its ends and sends its
  flow, and captions from the labels ("User → Browser: Sign in"), with no
  narration. Rewriting a draft is easier than writing from nothing, and it
  needs no LLM.
- **Hints as the user types.** The quick checks run in the browser (they
  are pure): each beat shows its length, a line or caption that goes by too
  fast to read, and a first beat too long for a hook (4.5's 5 seconds).
  Estimated from words, a line can look faster than its voice, so a new
  route, `GET /api/projects/:slug/narration`, gives the measured length of
  each line already spoken, by its words; an edited line falls back to the
  estimate. Hints are words, not errors: the script saves with them.
- **Errors in place.** The schema runs on every change; a problem shows in
  the beat or scene it belongs to, and Save waits until there are none.
- **One save.** `PUT /api/projects/:slug/storyboard` and MCP's
  `set_storyboard` share `saveStoryboard`: checked against the graph, it
  clears the stale beats it rewrote and moves the gate on.
- **Stale beats** are marked on their cards, with a line above the script
  saying how many and what clears them.

## Alternatives

- **A JSON editor.** Quick to build, hard for anyone who does not read
  JSON; the form is for the path by hand.
- **Hints from the server after a save.** Slower, and the user would not
  see a beat's length change as they write.
