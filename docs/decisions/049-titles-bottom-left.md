# 049: The titles in the bottom-left corner

## Context

Feedback (2026-11-27): with the wide angle, the scene title and the step
caption across the top hold the scene down, so it cannot be zoomed bigger;
a step caption cannot break onto a second line, which it sometimes needs;
and an isometric layout, drawn as a diamond, usually leaves the bottom-left
corner empty.

## Decision

- **`captions.place`**: "top" (as before, the default) or "bottom", in the
  Captions card. At the bottom, the scene title and the step caption go in
  the bottom-left corner, 42% of the width, above the narration, and the
  step caption may take two lines.
- **The scene is framed in the whole height** above the narration, over the
  corner: the corner is not kept clear, as that would give back nothing. A
  layout that reaches into it is reported by the checks, as any overlap is.
- **The beat list (048) rises from above the title**, the current line at
  the bottom and the oldest leaving from the top.
- **The step band takes the lines its longest caption needs**: the player
  wraps each step caption at the band's width, word by word in the video's
  font, as the page will. At the top that is one line or two, so a video
  whose captions fit on one keeps the band, and its look, as it was; in the
  corner it is two, or three for a long caption in a large size.
- **The camera zooms to 3×** (was 2×), so the height given back can be used.

## Alternatives

- **Keeping the corner clear of the scene.** Safe, but the scene would gain
  no height, which is the point.
- **Placing the titles wherever the scene leaves room**, frame by frame.
  Clever, but titles that move between scenes are hard to follow.
- **Two lines at the top always.** Simpler, but every video would lose a
  line of height for captions that may never need it.
