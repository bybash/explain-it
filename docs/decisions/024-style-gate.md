# 024: The style gate's panel

## Context

Slice 3.7 gives the style gate a panel. Its "Done when" is that changes show
in the preview straight away. The whole style (look, sound and extras) was
one slice; it is large, so it is split three ways: 3.7 the look, 3.11 the
sound, 3.12 the custom palette editor and font upload.

## Decision

- **A live preview with the render player.** The panel draws the video with
  the same player the renderer captures, so what is previewed is what is
  rendered, and it follows the form at once without a server round trip.
  The player puts the video's theme and font on the document it draws in
  and the stage has page-wide styles, so it runs in an iframe of its own
  (`src/web/preview.html`), built with the web app. The panel posts it the
  project and the unsaved config; it answers with the video's length and
  marks (the title card, each beat, the end) for a scrubber and buttons.
  Messages are checked with zod and taken only from the app's own origin.
- **Fonts and the saved logo come from the API** (`/api/fonts/…`,
  `GET /api/projects/:slug/logo`), so the preview works the same under
  `npm start` and `npm run dev`. The fonts route serves only `.woff2` files
  inside `assets/fonts/`.
- **Explicit Save, as at the graph gate.** Save sends what changed as a JSON
  Merge Patch (RFC 7386), so a field taken out of the form is taken out of
  `config.json`, with any logo files picked since the last save.
  `PUT /api/projects/:slug/style` and MCP's `set_style` share one function,
  `saveStyle`: every setting and logo is checked before anything is written.
  The gate cannot be approved while changes are unsaved.
- **Logos only as data from the page.** MCP may name a file on the server's
  machine; the page may not, since that would let a page read any file. A
  style edit may carry two logos at their largest, so its route allows about
  6 MB where the rest of the API allows 1 MB. The file name a logo is saved
  under (`logo-<mode>.<ext>`) is in the schema, so the form's draft checks as
  it will be saved.

## Alternatives

- **Stills from the server after each change:** exactly what a render gives,
  but a second or more per change, and Chrome busy on the server.
- **Mounting the player in the app's own page:** no iframe, but the video's
  theme and the stage's styles would restyle the app around it.
- **Saving as the form changes:** no Save button, but every keystroke in a
  card would write `config.json`, and the graph gate already set the
  pattern of an explicit Save.
