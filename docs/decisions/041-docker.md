# 041: The Docker image

## Context

Slice 6.1 (ROADMAP). The app needs Node, Chrome and ffmpeg, and Windows
users have no native path (SPEC, Docker). The image has to run the app and
the CLI on a clean machine, render the same videos, and keep keys and
projects out of the image.

## Decision

- **Debian slim with Debian's Chromium**, built for `linux/amd64` and
  `linux/arm64`. Google Chrome has no Linux Arm build, and Apple-silicon
  Macs would otherwise render under emulation. `CHROME_PATH` points the
  render at it (1.9).
- **Two stages.** The first installs everything and builds the web app and
  the render page; the second installs only the runtime dependencies, so
  Vite is absent and a render uses the built page. The voice's ONNX runtime
  keeps only the build for the image's own system and processor.
- **Three volumes**: `projects`, `cache` (the voice model and voices) and
  `config`, where the settings page writes `.env` (`ENV_FILE`). Keys never
  sit beside the projects, which people share, or in the cache, which
  people delete. A key passed with `-e` wins over the file, as on a
  machine.
- **It listens on `0.0.0.0` inside**; the documented `docker run` publishes
  the port on `127.0.0.1` only. The host-name check still refuses other
  names, as without Docker.
- **It runs as `node`**, not root, under `tini`, which passes on `docker
  stop` and reaps the Chrome processes a render leaves.
- **Its licences are stated, not assumed MIT.** eSpeak NG (GPL-3.0+) and
  libvips (LGPL-3.0+) run in the app's process, and Debian's ffmpeg is a
  GPL build. `NOTICE.md` is copied into the image and names each with its
  source; each package's own licence file stays in the image; the image's
  licence label lists them. Nothing in them is changed. A check of this
  against the licences comes before the first publish (6.5).
- **Published on version tags only** (`v*.*.*`), to `ghcr.io/bybash/explain-it` with the
  version, the minor version and `latest`. Nothing is published before the
  release (6.5).
- **Checked by hand for this slice**: built and run here, the page and API
  answering, a foreign host refused, and the example rendered inside the
  container, with and without the voice. No CI job builds the image yet.

## Alternatives

- **Playwright's image.** Its Chromium matches the tests', but it is about
  2 GB before ffmpeg, against "slim".
- **Alpine.** Smaller, but the voice's ONNX runtime and Chromium need
  glibc.
- **The key in the cache or in the projects folder.** One volume fewer, but
  a key would sit in a folder people delete or share.
- **A CI smoke test of the image on each PR.** Catches a broken image
  before release, but adds a multi-minute job; carried over (ROADMAP).
