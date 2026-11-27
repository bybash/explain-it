# 045: Badges as tags, and arrowheads in sight

## Context

From watching the examples (ROADMAP, Feedback 2026-11-27). A badge
("Held", "Order placed") and an edge's label ("Pay") were the same rounded
pill, so a node's state read like the name of an arrow. And an edge that
arrives at its target from behind (from the top left or right in this
view) ended at the box's footprint on the floor, where the box, drawn over
the edges, hid the last stretch and the arrowhead.

## Decision

- **A badge is a tag with pointed ends**: its outline in its tone, a grey
  fill (the surface mixed with the muted colour, so it reads in light and
  dark), and its tone's dot kept, so ok, warn and error still read at a
  glance. Edge labels keep their pills: a pill names an arrow, a tag tells a
  node's state. A tag is a little wider than the pill was, so a badge may
  sit a little further from its node's corner than before.
- **An edge stops at its target's outline.** Where the end of an edge lies
  inside the target box's outline on screen, the edge is cut back to just
  outside it, 6 px short, so its arrowhead is always in sight. Only the
  stretch at the end counts, so a route that passes behind the box earlier
  is not cut for it. An edge that arrives from the front already ends on the
  outline and is unchanged, and one that would be left too short for its
  arrowhead is left whole. The
  cut is made where the edge is drawn, so the preview, the render and the
  checks see the same line.

## Alternatives

- **Arrowheads drawn above the boxes.** Always in sight, but floating over
  a box that should hide the line.
- **Routes that end on the visible side of a box.** Better still, but the
  router would have to know the view; the cut gives the same picture.
- **A badge in another colour only.** Too close to a pill at a glance; the
  shape is what tells them apart.
