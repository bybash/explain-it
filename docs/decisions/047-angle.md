# 047: The angle the scenes are seen from

## Context

Feedback (ROADMAP, 2026-11-26): another angle could fit a 16:9 frame better
than isometric and leave room to zoom in. Isometric shows a layout as a
diamond as tall as it is wide in grid terms, so a wide frame often keeps
empty space beside it.

## Decision

- **An `angle` in `config.json`**: isometric (the default), wide or high,
  chosen in the Look tab and settable by agents with `set_style`.
- **One projection, drawn flatter or deeper.** The engine's projection becomes
  axonometric, turned 45° about the vertical as before, seen from an
  elevation above the floor: the floor goes down by its sine, widths
  unchanged, and heights keep isometric's ratio to the floor (twice), so a
  box never hides more of the floor behind it than in isometric and the
  layout's routes stay in sight. (True heights, by the cosine, were tried:
  from lower down the boxes hid edges for 100 to 280 px in the examples.) Isometric is the elevation the engine always
  had (about 35.3°) and keeps its exact old formula, so videos made before
  are unchanged to the pixel and the golden stills hold.
- **Wide is 25°, high is 50°.** Wide draws the floor as it looks from lower
  down, so a layout that is limited by the frame's height uses more of its
  width and its boxes are drawn larger; one limited by its width gains
  nothing. High is the other way, for a layout taller than wide.
- **What it is, plainly:** with heights kept at isometric's ratio, wide and
  high are the isometric picture squashed or stretched vertically (wide by
  about 0.73, high by about 1.33), then framed. The box sides look lower in
  wide than a true view from 25° would show; that is the price of keeping
  every route in sight.
- Everything is drawn from projected points (box faces, labels laid on
  them, zones, routes, framing and the camera), so nothing else changed.

## Alternatives

- **"60°" as an elevation**, looking down 60° from the floor. Tried: 50°
  and 60° make the floor deeper, so a wide layout fits a 16:9 frame worse.
  Read as 60° from the vertical, it is 30° above the floor, close to wide's
  25°, and that reading fits the feedback's aim: a better fit for the frame.
- **A free slider for the elevation.** More control, but most values look
  odd; three named angles say what each is for.
- **An angle per scene**, as the camera is. Possible later; one angle keeps
  a video's look the same from scene to scene.
