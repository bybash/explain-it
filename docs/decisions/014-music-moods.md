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
- **What the seed changes:** where the progression starts, which arpeggio
  pattern plays, every note's phase, and ±10 % in each note's loudness. The
  generator is mulberry32 (`src/audio/random.ts`), pinned by a test.
- **One loudness.** Every mood is scaled to −22 dBFS RMS, measured between
  the fades, with peaks kept under −1 dBFS, so the mix's `volumeDb` and
  ducking (2.4) mean the same for every mood.
- **48 kHz.** The rate the mix and the video use; Kokoro's 24 kHz lines are
  resampled in the mix.
- **Made, not cached.** 75 s of music takes under a second, and the same
  inputs always give the same samples, so a render makes it again rather
  than keeping a file.

## Alternatives

- **Recorded loops** shipped with the app: richer sound, but licences,
  size, and no seed.
- **A generative model** (MusicGen): SPEC rules it out; heavy and not
  deterministic.
- **All three moods ambient**, differing only in key: safest under speech,
  but "upbeat" would not be.
