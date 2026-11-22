# 015: Mix and outputs

## Context

Slice 2.4 puts the voice (2.1, 2.2) and the music (2.3) into the video.
SPEC set the target (music ducks under the voice; −16 LUFS, true peak at or
below −1 dBTP) and the outputs, but not the levels, what `music.volumeDb`
means, or what the clean video leaves out.

## Decision

- **The prototype's levels.** The voice is levelled to −18 dBFS RMS while it
  speaks. `music.volumeDb` is the music's level against the voice while
  nobody speaks; its default moves from −24 to the prototype's −12, which
  the user chose. While the voice speaks the music dips 6 dB further, along
  the prototype's envelope: speech smoothed over 0.35 s, tripled and capped,
  so the dip starts just before a line and ends just after it.
- **Lines start at their beats.** Each line starts at its beat's start plus
  the lead-in, from the same beat plan the video plays, so the voice and the
  caption cues line up by construction.
- **Spikes limited, then one gain.** Kokoro's plosives peak about 22 dB over
  its speech; left alone they capped the gain, and the example stayed at
  −17.1 LUFS. A short-attack limiter set 13 dB above the mix's own level
  catches them (about 0.5 % of the example's samples). Then ffmpeg's
  loudnorm brings the mix to −16 LUFS in two passes, one to measure and one
  to apply a single gain (linear), so speech and pauses keep their balance,
  aiming at −1.5 dBTP so its small overshoot stays under −1. `measureLoudness` reads
  ffmpeg's EBU R128 meter, for the tests and the loudness check (2.6).
- **The clean video drops the narration captions only.** The `.srt` carries
  them for players and platforms; the step captions are part of the
  explainer. Each frame is seeked once and captured twice, with the
  narration hidden by a class the page toggles (`__captions(false)`), so
  capture takes about twice as long (the example at 720p: 79 s, from about
  35 s). With narration captions off the clean video is a copy.
- **The audio goes in at encode time,** as a second ffmpeg input, so each
  video is written once, with no remux.

## Alternatives

- **Keep −24 by default:** a faint bed, safest for speech, often inaudible
  on laptops.
- **Clean without any captions:** loses the step captions, which explain
  the picture.
- **Clean only when asked:** faster default renders, but SPEC lists the clean
  video as an output of every render.
- **Burning captions with ffmpeg (libass)** into one capture: not in every
  ffmpeg build, and the captions would no longer be the page's own.
