# 014: Music moods

## Context

Slice 2.3 ports the prototype's music to TypeScript. The prototype had one
mood, a slow warm pad; SPEC asks for three (calm, upbeat, technical), seeded,
and the music has to sit under narration without competing with it.

## Decision

- **A plan, then a sound.** `musicPlan` turns a mood, a seed and a length
  into notes (time, length, pitch, instrument, gain, phase); `renderMusic`
  plays them. The plan is plain data, so determinism and tempo are tested
  without listening; the sound is judged by ear from the PR's samples.
- **Moods as data.** Each mood is a row in one table: its chords, its bar
  length (tempo), and what plays over them.
  - calm: the prototype's pad (Cmaj9, Am9, Fmaj9, G6, 8 s a chord) with a
    high pluck six times a bar.
  - upbeat: D, A, Bm, G at 100 bpm, a lighter pad, an eighth-note pluck
    arpeggio and a soft low pulse on each beat.
  - technical: Dm9, B♭maj7, Fmaj7, C at 110 bpm, a sixteenth-note arpeggio of
    short glassy notes over a held drone, without a pad.
- **What the seed changes:** where the progression starts and which
  arpeggio pattern plays (4 × 3 = 12 note sequences a mood), every note's
  phase, and ±10 % in each note's loudness, so repeats do not sound
  mechanical. Many seeds therefore sound alike; that is enough for "a
  project always gets the same music". The generator is mulberry32
  (`src/audio/random.ts`), pinned by a test.
- **The prototype's sound.** calm keeps its pad (three sines detuned by
  ±0.12 %, each with its own octave and phase), its plucks, its Hann
  lowpass (15 points at 24 kHz, so 29 at 48 kHz) and its echo (three
  feed-forward passes 0.38 s apart at 0.32). Every mood shares that
  mastering. Every note ends with a 20 ms release, so a cut never clicks.
- **One loudness.** Every mood is scaled to −22 dBFS RMS, measured between
  the fades, with peaks kept under −1 dBFS, so the mix's `volumeDb` and
  ducking (2.4) mean the same for every mood. On short music the fades
  shorten to a quarter of it each, so there is always a middle to measure.
- **48 kHz.** The rate the mix and the video use; Kokoro's 24 kHz lines are
  resampled in the mix.
- **Made when needed, for now.** The same inputs always give the same
  samples. 75 s takes 1.4 s (technical) to 6.8 s (upbeat) on a laptop, and
  10 minutes up to about a minute; 2.4 decides whether to cache it like the
  voice or speed up the synthesis.

## Alternatives

- **Recorded loops** shipped with the app: richer sound, but licences,
  size, and no seed.
- **A generative model** (MusicGen): SPEC rules it out; heavy and not
  deterministic.
- **All three moods ambient**, differing only in key: safest under speech,
  but "upbeat" would not be.
