# 004: Edge routes and labels

## Context

Slice 1.5 draws edges from the routes in `layout.json`. Two gaps showed up.
Grid snapping moves each box by up to a quarter unit, which leaves small jogs
in routes ELK drew straight. And layout drops the route of an edge whose end
was moved by hand, so the engine has nothing to draw for it. Labels drawn on
the floor were also hidden by the boxes drawn after them.

## Decision

- **Layout straightens jogs.** A bend shorter than one grid step between two
  parallel runs is removed by moving one run across. A run that ends on a box
  moves only while its end stays on that box's side. `layout.json` stays the
  single place routes come from, and it is clean when written.
- **The engine draws a fallback route** where `routes` is `null`: straight
  between boxes that share at least half a unit of a side, otherwise out of
  the source along x and into the target along y. The layout format is
  unchanged; `null` keeps meaning "an end was overridden".
- **Labels are upright pills in a layer above the nodes**, centred on the
  longest stretch of the route that no node hides.

## Alternatives considered

- Straightening jogs in the engine at draw time: `layout.json` would keep the
  jogs, and the checks in slice 2.5 would read different routes from the ones
  drawn.
- Rerunning ELK with the overridden node pinned: ELK's layered algorithm does
  not take fixed positions for some nodes, and the fallback only needs to be
  good enough until the user lays out again.
- Labels lying flat on the floor, like node labels: hard to read along
  diagonal segments, and still hidden by boxes.
