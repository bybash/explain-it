# 017: Timing and audio checks

## Context

Slice 2.6 adds the last three checks in SPEC's table: reading speed,
narration fit and loudness. With narration-first timing (decision 013) and
a mastered mix (decision 015), two questions came up: what reading speed
narration captions can be held to, and where the check gets a mix to
measure.

## Decision

- **Two reading limits.** Step captions are read alone, so they keep SPEC's
  15 characters a second. Narration captions are subtitles of speech the
  viewer also hears; they follow the voice, which speaks at 14.6 to 15.9
  characters a second on the example, so 15 would flag normal speech. They
  are held to 17, the common subtitle limit, which still catches a voice
  too fast to follow. The limits live in the schema (`READING_SPEED`), and
  the engine's reading-time rule takes the step limit from there, so a
  video with its voice off passes its own check.
- **Every beat leaves time to read its step caption.** Before, only a beat
  without narration did; a long caption on a short spoken line flashed by,
  and with the voice off a silent video could fail its own reading check.
  A beat now lasts at least its caption's reading time either way, so step
  captions pass by construction and the check guards the rule. It changes
  no beat of the example, whose captions fit in the shortest beat.
- **Narration fit against the room a beat leaves.** A line has from the
  lead-in to the beat's end. Timed by its own lengths a video always fits,
  so in a check this guards narration-first timing; it matters for a plan
  timed otherwise, such as a preview before the voice exists.
- **What cannot run is said.** The layout checks need Chrome, loudness
  needs ffmpeg, and narration fit and loudness need the voice. A check that
  cannot run is listed under `skipped` with the reason; the others run.
  Reading speed needs nothing. A warning is either at a beat (scene, beat
  and time required) or about the whole video (loudness), so the report
  keeps its shape strict.
- **The check mixes its own soundtrack.** `check` makes the soundtrack a
  render would (voice and music, mastered), measures it with ffmpeg's
  EBU R128 meter and removes it, so loudness is known before anything
  renders. A loudness warning is about the whole video and names no beat.
- **One report.** All checks write to `checks.json`, which the MCP tool
  returns under `checks` (it was `layout` in 2.5).

## Alternatives

- **15 for every caption,** as SPEC first said: the example's voice would
  fail it at normal speed, and the only fix would be slowing the voice.
- **Reading speed for step captions only:** would miss a voice too fast to
  follow.
- **Measuring the last render's audio:** cheaper, but stale after edits,
  and absent before the first render.
