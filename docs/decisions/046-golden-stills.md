# 046: Golden stills in the Docker image

## Context

Slice 6.3: CI should fail on a visual regression. The engine is tested by
its state at a time, and its look was judged by eye in each PR; nothing
caught a change in how the examples are drawn. And CI had no ffmpeg, so the
render test never ran there (1.9, 6.1).

## Decision

- **One golden still per beat of each example**, at the moment the checks
  look at it, light, timed by the estimated voice (no voice model needed),
  shrunk to 960 px wide by Chrome's own canvas: large enough to see a label
  or an arrowhead go, small enough to keep in `golden/` (no image library is
  added). A still fails when more than 0.1% of its pixels move by more than
  32 steps in a channel.
- **Made and checked in the same place: the Docker image's test stage** (the
  build stage with Debian's Chromium and ffmpeg). Text is drawn differently
  by Chrome on a Mac and on Linux, so stills made on a laptop would fail on
  CI. `npm run golden` makes them in that image, built for CI's processor
  (amd64, emulated on an Arm Mac); `npm run golden:check` and CI compare.
  A difference is written to `golden-out/`, with an image of it, which CI
  keeps as an artifact.
- **The same CI job runs the render test and the layout repair** in that
  image, so they run on every PR at last, then builds the real image and
  checks that it starts and answers.

## Alternatives

- **Stills on the CI runner's own Chrome, with ffmpeg installed.** Simpler,
  but they could only be made on CI, and Google Chrome's updates would move
  them; the image pins Debian's Chromium until its base changes.
- **Full-size stills.** Exact, but about 7 MB in the repository.
- **A perceptual comparison (SSIM).** Kinder to anti-aliasing, but another
  dependency; a channel tolerance and a share of pixels have been enough
  for the app's own screenshots (`npm run shots:compare`).
