# 028: The render gate

## Context

Slice 3.9 gives the Render gate its panel. Its "Done when" is that the
example renders from the UI. The render queue already existed (4.3): one
job at a time, cancel, and a `render` event on each change. Jobs live in
memory, so a restart forgets them, but their files stay in
`out/<time>/<theme>/`. A render reported no progress while it spoke the
voice or mixed the music, and it mixed the soundtrack again even when the
Preview gate had just mixed the same one (3.8).

## Decision

- **Finished renders are read from disk.** A render writes
  `out/<time>/render.json` once every theme is done, holding its start
  time, resolution, themes and length. The gate lists the queue's jobs for
  the project, then every folder with a manifest. Renders survive a
  restart, and renders made by MCP or the CLI show too. A folder without a
  manifest (still running, or stopped) is never listed, so a render is
  shown only when it is complete. A job names its folder (`stamp`) once it is
  made, so the panel can tell a done job from the render it left on disk.
- **A job names its step.** `step` on the job is one of: the voice, with
  lines spoken of how many; the mix; a theme's frames, whose count stays
  in `progress`, now reported every hundredth rather than every tenth; or
  finishing its files. MCP's `render_status` gets it too.
- **The preview's mix is reused.** The preview's soundtrack is mixed by
  the same function from the same files, under a key of what the sound
  follows. When a file for the render's files exists, the render copies it
  instead of mixing again.
- **The panel renders with the style's theme and resolution, which can be
  overridden.** The request already takes both, and choosing them does
  not change `config.json`.
- **Files are served from the render's folder only.** The route takes the
  render folder, the theme and a file name, and serves only one of a
  finished render's own files. Videos are served in byte ranges, so the
  inline player can seek, and any file comes as a download with
  `?download=1`.

## Alternatives

- **Live jobs only.** This is simpler, but the gate would be empty after
  a restart while the videos still sit on disk.
- **Keep jobs in a file.** That would also survive a restart, but it would
  duplicate what the folders already hold. Renders made by the CLI would
  still be missing.
- **List folders without a manifest by their files.** Each theme's
  contact sheet is written last, but while a two-theme render is running,
  its first theme already looks finished.
