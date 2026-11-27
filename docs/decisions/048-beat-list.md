# 048: The beat list

## Context

Feedback (ROADMAP, 2026-11-26): keep the angle and use the empty left side
for the beat titles, listed from top to bottom, the active beat's title
solid and the ones before it semi-dimmed. A layout drawn as a diamond
often leaves the left of a 16:9 frame empty, while the step caption at the
top shows one beat at a time.

## Decision

- **`captions.list`**, off by default, in the Style gate's Captions card
  under the step captions it changes. When on, the step captions are drawn
  as a list down a column on the left (30% of the safe width), under the
  scene title, in place of the step caption at the top.
- **A line per beat**: its caption appears as its beat starts and stays to
  the scene's end; it is solid while its beat is on and fades to 45% once
  it is over. Later beats are not shown before they start, so the list
  never gives away what comes next. Each scene starts its own list.
- **The content moves right** of the column, so the scene is framed in
  what is left; a camera or a layout made for the full width may need
  another look, and the checks say where.
- **The checks know the lines**: each is measured as a step caption (for
  overlaps and the frame) and read while its beat is on (reading speed).

## Alternatives

- **All of a scene's beats listed from its start**, the coming ones
  faint. A table of contents, but it gives the story away and crowds a
  long scene.
- **The list on the right.** The left is where the scene title and step
  caption already are, and where reading starts.
