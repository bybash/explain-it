# 025: Samples of the voice and the music

## Context

Slice 3.11 adds the sound to the style gate: the voice and its speed, the
pacing, the captions and the music. Its "Done when" is that a voice sample
plays from the panel. Choosing a voice or a mood from names alone is
guesswork, so both get samples.

## Decision

- **The voice says the script's first line.** You hear the video's own
  narration in the chosen voice and speed, or a sentence of its own when the
  script has no narration yet. It is spoken through `speakLine`, the cache
  the video's lines use (`cache/tts/`, keyed by model, voice, speed and
  text), so the same sample plays at once the second time, and the render
  does not speak that line again.
- **The music plays 15 s of the mood and take**, made on the server in
  about half a second and not cached. Its volume is played below the
  loudest the sample can be without clipping (0 dB is that loudest), so
  every step of the slider is heard; the mix sets the real level against
  the voice. Without narration the slider is hidden, since the music is
  then the whole soundtrack. "Another take" moves to the next seed, which
  the video then uses.
- **One sample at a time.** The panel has one player: a new sample stops
  the last, and Stop also cancels one still being made. A line asked for
  twice at once (two clicks, two tabs) is spoken once.
- **Failures say what happened.** A voice model that cannot load answers
  with its own message (check the network, delete a cut download), and a
  script that does not read is named rather than covered by the sentence
  of our own.
- **Two GET routes, answering WAV:** `GET /api/projects/:slug/samples/voice`
  (the project gives the line) and `GET /api/samples/music` (no project
  needed). Their queries are checked with the schemas the config uses, so a
  voice, speed, mood, take or volume the config refuses is refused here too,
  by name.
- **A plain waiting note for the first voice.** The first sample may wait a
  minute or two while the model downloads; the button says the voice is
  getting ready. No progress bar: the model loader reports none the panel
  can use yet.

## Alternatives

- **A fixed sentence for every project:** simpler, but you would not hear
  your own narration, and the render could not reuse the line.
- **Music in the preview itself:** the preview plays no sound until the
  preview gate (3.8), where the voice is generated; a sample is enough to
  choose a mood.
- **Download progress from transformers.js:** more work through the Kokoro
  adapter and the event stream, for a wait that happens once per machine.
