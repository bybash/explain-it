# 054: A smaller image, built faster

## Context

The v0.1.0 image was 1.65 GB, and publishing it took 8 minutes; v0.1.1's
build took far longer. Its layers: Debian's Chromium and ffmpeg with their
libraries (839 MB), the app's production node modules (553 MB), and Node's
base image (about 250 MB). The Arm half was built on an Intel runner under
emulation.

## Decision

- **The node modules lose what Node never loads in the image**
  (`scripts/prune-image.sh`, which says why for each): source maps, the
  voice's browser runtime (`onnxruntime-web`) and transformers.js's browser
  builds and WebAssembly, the voice runtime's binaries for other systems,
  sharp's libvips for musl, Mermaid's standalone browser bundles and their
  chunks, and Lucide's ESM and UMD builds. A scratch install of the
  production modules went from 761 MB to 278 MB; Mermaid's parser under
  jsdom, Lucide's `icons` and sharp still load from it.
- **CI renders an example inside the image** (the checkout example, voice
  included), after checking that the server reads a Mermaid flowchart, so a
  prune that removes something loaded fails the pull request, not a release.
  The golden stills run in the test stage, which is not pruned, so they
  could not catch it. The image's size is printed there too.
- **Each platform builds on its own kind of runner**: Arm on GitHub's Arm
  runner (free for public repositories) rather than emulated, then a last
  job joins the two under the release's tags. It runs on a release tag, so
  the next release is its first run.

## Alternatives

- **Chrome's headless shell and a smaller ffmpeg.** About 500 MB more, but
  it changes the browser that draws the frames, so it is its own step, with
  the golden stills made again (ROADMAP, Later).
- **Alpine instead of Debian.** Chromium and ffmpeg on musl differ more from
  the browser the golden stills were made with, and sharp and the ONNX
  runtime have their own builds there.
- **A separate image without the voice.** Smaller for those who do not want
  narration, but two images to build, test and explain.
