# 044: Framing: the scene number, the title card and the camera

## Context

Feedback from a one-scene video (ROADMAP, Feedback 2026-11-26). Its scene
label read "1 · How neurons form a network", a number with nothing to
count. Its title card held about 8 s: a card held as long as a caption
would take to read, at 15 characters a second. And the scene was framed
to fit, leaving the top and the right of the frame empty, with no way to
fill it.

## Decision

- **No number for a single scene.** The label is the scene's title alone
  when it is the only one.
- **A shorter title card, and a setting.** A title card is read with
  nothing else on screen, so it is timed at 20 characters a second, 3 to
  5 s. `cards.title.seconds` (2 to 10 s) sets it outright, in the Look tab's
  "How long" (Auto or a number of seconds). The title card closing the
  video holds as it opens it. End cards keep their timing: a link and a
  place to find it take longer to read.
- **A camera per scene, in `config.json`.** `camera` maps a scene id to a
  zoom (1 to 2) and a move (`x` right, `y` down, each up to half the
  frame's width or height). The scene is fitted first, then zoomed about
  the middle of its area and moved; a scene without a camera is framed as
  before, so existing videos only change by the shorter title card. It is
  per scene because scenes frame different nodes, and in `config.json`
  because it is how the video looks, like the palette, saved by the style
  gate and `set_style`. A camera for a scene that is gone is kept and
  unused.
- **Sliders, not dragging.** The Look tab's Camera card has Zoom, Left or
  right and Up or down sliders for one scene at a time, the preview drawing
  each move, and Reset. A camera that changes nothing is left out of the
  file.
- **The checks judge the result.** A scene moved under a caption or out of
  the frame is caught by the overlap and off-frame checks, as any layout
  is; nothing stops the user from trying.

## Alternatives

- **One camera for the whole video.** Simpler, but a scene of three nodes
  and one of ten would get the same move.
- **The camera in the storyboard**, on each scene. It would travel with the
  scene, but the storyboard is the story, and the Script gate would gain
  a look setting.
- **Drag and scroll on the preview.** More direct, but harder to make exact
  and to test; sliders come first.
- **A steeper angle**, or the beat titles down the left side: other ways
  to use the frame, not placed yet (ROADMAP, Feedback 2026-11-26).
