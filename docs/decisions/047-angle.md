# 047: The angle the scenes are seen from

## Context

Feedback (ROADMAP, 2026-11-26): another angle could fit a 16:9 frame better
than isometric and leave room to zoom in. Isometric shows a layout as a
diamond as tall as it is wide in grid terms, so a wide frame often keeps
empty space beside it.

## Decision

- **An `angle` in `config.json`**: isometric (the default), wide or high,
  chosen in the Look tab and settable by agents with `set_style`.
- **One projection, seen from a height.** The engine's projection becomes
  axonometric, turned 45° about the vertical as before, seen from an
  elevation above the floor: the floor goes down by its sine, widths
  unchanged, and heights keep isometric's ratio to the floor (twice), so a
  box never hides more of the floor behind it than in isometric and the
  layout's routes stay in sight. (True heights, by the cosine, were tried:
  from lower down the boxes hid edges for 100 to 280 px in the examples.) Isometric is the elevation the engine always
  had (about 35.3°) and keeps its exact old formula, so videos made before
  are unchanged to the pixel and the golden stills hold.
- **Wide is 25°, high is 50°.** From lower down the floor is flatter, so a
  layout uses a wide frame's width and its boxes are drawn larger; this is
  the one that answers the feedback. High is the other way, for a layout
  that is taller than wide.
- Everything is drawn from projected points (box faces, labels laid on
  them, zones, routes, framing and the camera), so nothing else changed.

## Alternatives

- **"60°" read literally as an elevation.** Tried: 50° and 60° make the
  floor taller, so a wide layout fits a 16:9 frame worse, not better. The
  feedback's aim, a better fit and room to zoom, comes from lower down.
- **A free slider for the elevation.** More control, but most values look
  odd; three named angles say what each is for.
- **An angle per scene**, as the camera is. Possible later; one angle keeps
  a video's look the same from scene to scene.
