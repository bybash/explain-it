# 013: Narration-first timing and pacing

## Context

Slice 2.2 times each beat by its spoken line. SPEC's rule gave a fixed
0.3 s on either side of the narration. Driven by real speech, that makes a
run of narrated beats move at the pace of talking, with little time to look
at the picture after a line ends, and nothing a user could do but slow the
voice down.

## Decision

This supersedes decision 007's "0.3 s either side": narration and actions
still start 0.3 s into a beat, but the time after them is the pace's pause.

- **Narration first, animations never rushed.** A beat lasts until the
  longer of its narration and its actions ends. Actions always run at their
  default speed; a short line leaves the beat as long as its actions need,
  and a long line spreads the spare time between them.
- **Paces.** `config.pacing` is relaxed (default), normal or brisk. Each
  sets the pause after a beat's narration and actions, and the shortest a
  beat can be: 1.0 s and 3 s, 0.6 s and 2 s, 0.3 s and 1.5 s. Brisk keeps
  the old pause. The names and numbers live in the config schema
  (`PACES`, `PACE_TIMINGS`), so the authoring guide shows them too.
- **Measured where the voice exists.** Every render generates the voice
  first (cached lines are instant) and times the video by it; `check`
  reports measured timing; `set_storyboard` reads lines already cached,
  generating and creating nothing, estimates the rest, and says how many of
  each.
- **Voice off: read, not spoken.** Without a voice a line is timed by
  reading it at 15 characters per second, the reading-speed check's limit,
  rather than an estimate of speech. With the narration captions off too,
  nothing carries the line, so it does not time its beat.
- **No voice, no render.** While the voice is on, a render cannot go on
  without it: a voice that fails stops the render, and `check` reports it
  as a problem with the way out (turn the voice off). Falling back to the
  estimate would make a video that 2.4 cannot mix a voice into.
- **Cancelling** stops voice generation between lines; a model download
  already under way finishes first.
- **Lengths travel as data.** The render page takes measured lengths by
  beat id in `window.__project.narration`, checked by `NarrationSchema`;
  the beat builder stays pure.

## Alternatives

- **Exact numbers instead of presets** (`pauseAfter`, `minBeat`): more
  control, more to explain and validate. Presets can gain overrides later.
- **Slowing the voice** (`voice.speed`) as the only control: it lengthens
  beats, but the speech drags.
- **Render reads only lines `check` cached:** keeps Kokoro out of the render
  path, but a video's timing would depend on whether `check` ran first.
