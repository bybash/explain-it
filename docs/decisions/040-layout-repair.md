# 040: Layout repair

## Context

Slice 5.6 (ROADMAP). The layout engine keeps routes in sight of boxes and
places labels and badges clear of each other (2.5), but some problems it
cannot fix: an edge's label sits at the middle of its line, and a crowded
scene has no room to spare. The checks report them; nothing fixed them.

## Decision

- **The LLM changes labels and scenes, never places.** A repair is new
  labels by id (nodes, edges, zones) and a JSON Patch on the script's
  scenes: fewer things in a frame, or shorter things. The answer cannot
  move a box or change an id: labels are the only field of the graph it
  names (`LayoutRepairSchema`).
- **It is offered in the chat, as a fix** (5.8): the files before and
  after, whole (`rewrite`), with Apply and Undo; undo is refused when
  either file has changed since. It is offered rather than applied, as it
  changes the user's words. The next checks say whether it worked.
- **It comes after the layout fix**: a problem a hand-placed node is in is
  fixed by laying that node out again; only the rest goes to the LLM.
- **Done when** is shown on a crowded fixture (the example with long labels,
  every node in one scene): Chrome finds overlaps, the recorded repair
  (shorter edge and zone labels) is applied, and Chrome finds none
  (`src/render/repair.test.ts`).

## Alternatives

- **Positions by hand** (layout overrides from the LLM). Direct, but
  coordinates are where LLMs are weakest, and an override wins over the
  engine for good.
- **A loop with the checks in it**: each repair checked again in Chrome
  before it is offered. Surer, but slow, and its recordings would depend on
  Chrome's fonts, which differ between machines.
