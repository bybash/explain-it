# 008: Render page, capture and outputs

## Context

Slice 1.9 renders a project to an MP4 from the command line. The engine runs
in the browser, so the CLI needs a page Chromium can open with any project
on it, and a way to get frames into ffmpeg.

## Decision

- **A built page, served locally.** `vite.render.config.ts` builds
  `src/engine/page/render.html` into `dist/render/`. The CLI serves it, with
  the bundled fonts, from a small `node:http` server on `127.0.0.1` and a
  free port. In a checkout the CLI rebuilds the page first, so a render
  always shows the current engine; Vite stays a dev dependency.
- **The project is injected, then validated again.** The renderer sets
  `window.__project` with an init script before the page loads. The page runs
  the files through their schemas (validate at the edges) and reports a
  failure on `data-error`, which the renderer turns into an error.
- **One player.** The scene layers moved from the dev page into
  `src/engine/player.ts`, which both pages use.
- **Frames go to ffmpeg over a pipe.** Each frame is seeked, screenshotted as
  PNG and written to ffmpeg's stdin, so there are no temporary frame files.
  720p is captured at 1080p and scaled with lanczos.
- **Outputs per render:** `out/<timestamp>/<theme>/video.mp4`,
  `captions.srt` (from `__cues`) and `poster.png`. The poster is the middle
  of the first scene's last beat, when that scene is fully drawn.
- **playwright-core is a runtime dependency** (Apache-2.0); it uses the
  installed Chrome, or `CHROME_PATH`.

## Alternatives considered

- Vite's dev server at render time: no build step, but Vite would become a
  runtime dependency and every render would pay its start-up.
- Frames as files on disk, encoded afterwards: simpler to debug, but about
  2 GB of PNGs for a minute of 1080p.
- Rendering at 720p with a smaller device scale: blurrier text than scaling
  a 1080p capture.
- The last frame as the poster: in the example it is dimmed and shows only
  the second scene.
