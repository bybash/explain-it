# 026: The preview gate's player and its sound

## Context

Slice 3.8 gives the preview gate its panel. Its "Done when" is that the
example can be previewed with voice. The ROADMAP row also had the checks
and the contact sheet; they are split into 3.13, so this slice is the
player, its sound and the beat list.

## Decision

- **The sound is mixed on the server, as the render mixes it.** Opening the
  gate asks the server for the preview's sound: every line not cached yet
  is spoken (`generateVoice`, with progress), then the soundtrack is mixed
  and mastered by the render's own `makeSoundtrack` into
  `cache/preview/<key>.wav`. The key is a hash of the voice model, the
  graph, the script and the config, so nothing is made twice; a change to
  any of them makes it again, and only the lines that changed are spoken.
  What you hear is what renders.
- **Progress over the event stream.** Each line spoken, the mix and the end
  are `preview-sound` events; the panel reads the state with
  `GET /api/projects/:slug/preview-sound` and starts it with a POST. A newer
  request for a project stops the older one. A failure, such as a model
  that cannot download, is shown with its message and a Try again.
- **The picture follows the sound.** Until the sound is ready the video
  plays silently on a clock of its own, timed by estimates. Once it is, the
  page plays the WAV in an `<audio>` element and seeks the player to the
  audio's `currentTime` every frame, with the measured narration, so the
  beats land where the voice speaks.
- **One player page for both gates.** The style gate's iframe player grows
  a `usePreviewFrame` hook that both panels use; the preview page now takes
  the narration and answers each beat's place for the beat list.
- **A tone voice for the browser test.** `VOICE=tone` gives the app a voice
  that sounds a tone for each word with no model, so the browser test
  previews with voice without downloading Kokoro. Its id keeps its lines
  apart from spoken ones in the cache.

## Alternatives

- **Lines played in the browser at their beats:** no mix on the server, but
  no music, not what the render sounds like, and fiddly to keep in sync
  while scrubbing.
- **Generating the voice from a button:** nothing heavy runs on opening the
  gate, but the ROADMAP asked for the voice when a project enters the gate,
  and the cache makes a second opening instant.
- **Skipping the browser test's voice:** the "Done when" is the voice, so
  the test hears one, from the tone voice.
