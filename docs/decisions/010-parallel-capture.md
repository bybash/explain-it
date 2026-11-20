# 010: Parallel capture

## Context

Slice 1.10 makes rendering faster by capturing frames on four pages at once.
One page took about 91 s a theme for the example at 1080p (1692 frames). The
output must stay the same as a one-page render.

## Decision

- **Frames are interleaved, not split into long chunks.** Page `k` captures
  frames `k`, `k + 4`, `k + 8` and so on. A small reorder buffer
  (`captureInOrder` in `src/render/parallel.ts`) writes them to one ffmpeg in
  frame order, and lets no page run more than eight frames ahead of the next
  frame to write. There are no temporary files and no second encode, so the
  MP4 is byte-identical to a one-page render.
- **One browser per page.** Four pages in one Chrome share its screenshot
  pipeline: capture went from 18 to only 27 fps. Four browsers reach about
  60 fps.
- **Deterministic raster.** Chrome is launched with
  `--disable-partial-raster` and `--disable-gpu-rasterization`. Without them
  the anti-aliasing of fading text and shapes depended on what the page
  painted before and on how busy the machine was: the same frame differed by
  a level here and there between pages, and in about 80% of frames once
  seeks were interleaved. With the flags, every seek order and every number
  of pages gives the same pixels. The pixels differ slightly from 1.9's
  GPU raster (PSNR about 45 dB), which is not visible.
- The example now renders in about 35 s a theme at 1080p, against 91 s
  before.

## Alternatives considered

- Four contiguous chunks, each encoded to an H.264 segment and joined with
  ffmpeg's concat demuxer: as the slice was first written, but each segment
  starts a new keyframe group and rate control, so the video is not
  identical to a one-page render.
- Four contiguous chunks kept as PNGs, encoded once at the end: identical,
  but about 1 GB of frames for a minute of 1080p, in memory or on disk
  (rejected for disk in decision 008).
- Four pages in one browser: simpler, but little faster.
- `--disable-gpu`: also deterministic, but turns off GPU compositing too.
