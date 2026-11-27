# 046: Golden stills in the Docker image

## Context

Slice 6.3: CI should fail on a visual regression. The engine is tested by
its state at a time, and its look was judged by eye in each PR; nothing
caught a change in how the examples are drawn. And CI had no ffmpeg, so the
render test never ran there (1.9, 6.1).

## Decision

- **One golden still per beat of each example**, at the moment the checks
  look at it, light, and one per scene in dark, at its last beat, when the
  most is drawn, timed by the estimated voice (no voice model needed),
  shrunk to 960 px wide by Chrome's own canvas, which also compares them, so
  the check needs nothing but the browser it already runs: large enough to
  see a label or an edge change, small enough to keep in `golden/`. A still
  fails when more than 0.1% of its pixels (about 500) move by more than 32
  steps in a channel, so a change smaller than that, such as one arrowhead,
  can pass; only the moment at each beat's middle is compared, and dark
  only at each scene's last beat.
- **Made and checked in the same place: the Docker image's test stage** (the
  build stage with Debian's Chromium and ffmpeg). Text is drawn differently
  by Chrome on a Mac and on Linux, so stills made on a laptop would fail on
  CI. `npm run golden` makes them in that image, built for CI's processor
  (amd64, emulated on an Arm Mac); `npm run golden:check` and CI compare.
  A difference is written to `golden-out/`, with an image of it, which CI
  keeps as an artifact.
- **The browser is the image's own, installed before any source** in a
  stage the tests and the app share, so a change to the code keeps the same
  Chromium. It is not pinned: Debian replaces its Chromium with each
  security release and keeps no older version, so a pinned version would
  stop building. When Debian's Chromium changes how a still is drawn, CI
  fails with no code change; `npm run golden` then makes the stills again,
  and the PR shows the difference.
- **The same CI job runs every test of the renderer and the checks** in
  that image (`src/render` and the render end-to-end test), so the ones
  that need Chromium or ffmpeg run on every PR at last, then builds the
  real image and checks that it starts and answers.

## Alternatives

- **Stills on the CI runner's own Chrome, with ffmpeg installed.** Simpler,
  but they could only be made on CI, and Google Chrome's updates would move
  them; the image pins Debian's Chromium until its base changes.
- **Full-size stills.** Exact, but about 7 MB in the repository.
- **A perceptual comparison (SSIM).** Kinder to anti-aliasing, but another
  dependency; a channel tolerance and a share of pixels have been enough
  for the app's own screenshots (`npm run shots:compare`).
- **Comparing with sharp**, as `npm run shots:compare` does. sharp is a
  dev dependency for that script only; the canvas keeps the check inside
  the browser the test already runs.
