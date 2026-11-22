# 016: Layout checks

## Context

Slice 2.5 adds the first checks. SPEC named what is measured (projected node
tops and overlay boxes, at each beat's midpoint) and the thresholds (4 px of
overlap; a 5 % safe margin), but not which overlaps are meant, where the
geometry comes from, or what the report looks like. The 4.4 walkthrough had
shown a problem no rule named: a zone's label hidden behind a node.

## Decision

- **Measured on the page.** The render page seeks each beat's midpoint and
  reports what it draws (`__shapes()` in `src/engine/shapes.ts`), in stage
  pixels: every node's faces, every zone's platform and label (its real,
  slanted outline), every edge as drawn so far, and every overlay's box.
  Text sizes are what the page lays out, so nothing is estimated. The theme
  moves nothing, so one theme is checked.
- **Pure rules in the core.** `src/checks/` finds problems in those shapes:
  overlap depth by separating axes, how much of an edge runs inside a box,
  and distance past the safe area. Two shapes overlap when they must move
  more than 4 px apart.
- **Everything visible counts,** as the user chose: two nodes; a node on a
  zone it is not in (an override can put it there); a zone's label under a
  node or an overlay; an edge through a node it does not connect; an overlay
  on a node, except a callout or badge on its own; two overlays; and
  anything past the safe area. A node on its own zone, and an edge at its
  own ends, are meant.
- **Zone labels moved.** The label lay just inside the platform's back-left
  corner, where the zone's own boxes covered it ("explain-it server" showed
  as "exp"). It now lies flat on the floor along the platform's front-left
  edge, just outside it; a zone's boxes stand on its platform, so they
  cannot reach it there. The checks confirm it on the example and the 4.4
  project.
- **A report, not a gate.** `checks.json` (`CheckReportSchema`) holds every
  warning with its scene, beat, time, size and a sentence naming both
  shapes. `explain-it check` prints them and exits 1 when there are any;
  the MCP `check` tool returns them under `layout`. Layout warnings do not
  stop a render: the layout engine, and in 5.6 the LLM, fix them.
- **Missing tools are explicit.** `missingRenderTools` names each tool, so
  `check` reports the layout as not run when Chrome is missing.

## Alternatives

- **Shapes computed in Node** from the layout and the plan: no browser, but
  overlay and label sizes would be estimates.
- **SPEC's minimum** (node tops and overlays): would not have caught the
  hidden zone label, or edges through boxes.
- **Reporting the zone label and fixing it later:** the user chose to fix
  it here.
