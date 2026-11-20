# explAIn-it: specification

explAIn-it turns a described flow into a short isometric explainer video with
captions, voice and music. You describe the flow in a chat (in your own words
or as a Mermaid flowchart), approve the graph, approve the script, pick a style,
watch a preview, and download the video.

It is open source (MIT), runs on your own machine (`npm` or Docker), and uses
your own LLM key. Nothing is hosted by the project.

There are two ways in, both writing the same project folders:

- **The web app**: a chat in the browser, using your LLM key.
- **MCP**: your IDE's agent (Claude Code, Cursor, VS Code and others) connects
  to the running app, reads your repository itself, and writes the graph and
  script through tools. No LLM key is needed in explAIn-it.

This document is the source of truth for v1. Decisions that change it are made
in a pull request that edits this file.

## Goals

- Any flow, not only software: a login, a CI pipeline, an order, a process.
- From description to a 1–3 minute video in under an hour, most of it review.
- No hand-placed timings or positions: narration sets timing, the engine lays out.
- Easy to clone and run: one language (TypeScript), no database, no Python.
- Deterministic rendering: the same project renders the same frames.
- Usable from the IDE: explain a feature of the repository you are working in.

## Non-goals for v1

- Hosting, accounts, login, telemetry.
- explAIn-it cloning or exploring a Git repository itself. The web app takes
  pasted or uploaded text; through MCP, the IDE's agent reads the repository.
- Images or whiteboard photos as input; Mermaid diagram types other than `flowchart`.
- Voices in languages other than English (captions can be any language).
- Flat 2D style, camera moves within a scene, 9:16 vertical, GIF output.
- Checking a video against source code. Sources are recorded (see Project)
  but not yet checked.

## User flow

The app is a chat on the left and a panel on the right. Work moves through
five **gates**. Each gate shows its result in the panel; the user approves it
by chat or by button, or edits it, either through chat or directly in the panel.

| Gate | The LLM produces | The panel shows | Direct edits |
|---|---|---|---|
| 1. Graph | `graph.json` from the description and context | Mermaid code and the rendered diagram | Edit the Mermaid code |
| 2. Script | `storyboard.json`: scenes and beats | A list of scenes and beats | Edit captions, narration, actions |
| 3. Style | Nothing (defaults are filled in) | Palette, font, voice, captions, music, output | The form |
| 4. Preview | Nothing (voice is generated here) | The player with a scrubber, beat list, check warnings and contact sheet | Jump to a beat and edit it |
| 5. Render | Nothing | Render progress, then downloads | Cancel, render again |

Rules:

- The LLM drafts right away and states its assumptions. It asks at most two
  questions, and only when it cannot draft anything sensible.
- The user can go back to any gate. Editing the graph marks only the beats
  that reference changed nodes or edges as stale; the script gate lists them.
  A beat references what its actions name (a dim action names the nodes it
  keeps); a scene's node list does not make its beats stale. A stale beat
  stops being stale once it is rewritten.
- Style can be changed at any later gate without going back.
- Checks warn and never block. The user can always render.

## Data model

All files are JSON, validated with zod. JSON Schemas are generated from the zod
schemas and published in `schemas/`.

### Graph (`graph.json`)

The source of truth for the structure. Mermaid is generated from it for
display and parsed back into it after a user edit; fields that Mermaid cannot
express (kind, icon, category) are kept by matching node and edge ids.

```ts
type Graph = {
  version: 1;
  title: string;
  nodes: GraphNode[];   // at most 36 in total
  edges: GraphEdge[];
  zones: Zone[];        // Mermaid subgraphs
};

type GraphNode = {
  id: string;           // [a-z][a-z0-9_]*, stable across edits; not a Mermaid keyword (end, graph, subgraph…)
  label: string;        // shown on the node top, ≤ 24 characters
  kind: NodeKind;
  icon?: string;        // a Lucide icon name, validated against the icon set
  zone?: string;        // a zone id
  category?: string;    // a palette category name; default by kind
};

type NodeKind =
  | "actor" | "service" | "database" | "queue"
  | "document" | "decision" | "external";
// The eighth kind from the design, "group", is a Zone.

type GraphEdge = { id: string; from: string; to: string; label?: string; category?: string };
type Zone = { id: string; label: string; category?: string };
```

Each kind has a default box size, height, category and icon. A zone is drawn
as a tinted platform under its nodes. Categories are `accent`, `muted` and
`c1` to `c6`; a palette with fewer than six category colours repeats them in
order, and an unknown category draws in the accent colour. Edges and zones
without a category use the accent.

### Storyboard (`storyboard.json`)

```ts
type Storyboard = {
  version: 1;
  scenes: Scene[];      // 1–3
};

type Scene = {
  id: string;
  title: string;        // e.g. "Login"; shown as "1 · Login"
  nodes: string[];      // the subset of graph nodes in this scene, ≤ 12
  beats: Beat[];        // 3–10
};

type Beat = {
  id: string;
  caption: string;      // the step caption, ≤ 60 characters
  say?: string;         // the narration line; without it the beat is timed by its actions and caption
  actions: Action[];
  notes?: string;       // the author's own notes; never shown
};

type Action =
  | { type: "appear"; node: string }
  | { type: "flow"; edge: string; label?: string }
  | { type: "highlight"; node: string }
  | { type: "callout"; node: string; title?: string; text: string }
  | { type: "dim"; except: string[] }
  | { type: "badge"; node: string; text: string; tone: "info" | "ok" | "warn" | "error" };
```

The camera is fixed within a scene and frames the scene's nodes. Scenes change
with a short transition.

### Config (`config.json`)

```ts
type Config = {
  theme: { palette: string | CustomPalette; mode: "light" | "dark" | "both" };
  font: string;                         // a bundled font id or an uploaded font file
  voice: { enabled: boolean; id: string; speed: number };   // a kokoro voice, e.g. "af_heart"
  captions: { narration: boolean; step: boolean; size: "S" | "M" | "L" };
  music: { enabled: boolean; mood: "calm" | "upbeat" | "technical"; seed: number; volumeDb: number };
  output: { resolution: "1080p" | "720p" };
  cards?: {
    title?: { title: string; description?: string };   // ≤ 100 and ≤ 160 characters, wrapped
    end?: {
      headline: string;                 // ≤ 100 characters, wrapped
      link?: string;                    // an http(s) URL, ≤ 200 characters; also drawn as a QR code
      where?: string;                   // where to find the feature, ≤ 80 characters
      credit?: string;                  // who made the video, or the company, ≤ 80 characters
    };
  };
  logo?: {
    light?: string;                     // a file name in assets/ (no folders) ending in lower-case .png, .jpg, .jpeg or .svg, at most 2 MB;
    dark?: string;                      // at least one of the two; one serves both modes
    corner?: "top-right" | "bottom-right";              // default "top-right"
    show?: "start" | "end" | "both" | "all";            // the title card, the end card, both (default), or every frame;
                                                        // the title card closing the video counts as the end card
  };
};

type CustomPalette = {
  background: string; surface: string; text: string; muted: string; accent: string;
  categories: string[];                 // up to 6 colours
  dark?: Omit<CustomPalette, "dark">;   // generated from the light palette when missing
};
```

### Project folder

```text
projects/<slug>/
  project.json        name, current gate, stale beat ids, timestamps
  chat.jsonl          the conversation, one message per line
  context/            uploaded text files
  graph.json
  layout.json         computed positions plus the user's manual overrides
  storyboard.json
  config.json
  assets/             the logo, referred to from config.json
  cache/tts/          <hash of text + voice + speed>.wav
  out/<timestamp>/    rendered outputs
```

Projects are plain folders: they can be committed, diffed and shared. There is
no database.

### Project (`project.json`)

```ts
type Project = {
  version: 1;
  name: string;
  gate: "graph" | "script" | "style" | "preview" | "render";
  staleBeats: string[];
  origin: "web" | "mcp";
  sources?: { path: string; commit?: string }[];  // files the video explains, filled in over MCP
  createdAt: string;
  updatedAt: string;
};
```

`sources` is stored but not checked in v1. It allows a later check that lists
the files changed since the video was made.

## Engine

The engine runs in the browser. The same page is used for the live preview and
for frame capture, so what the user approves is what gets rendered.

- **Layout.** elkjs (`layered`, orthogonal edge routing, zones as compound
  nodes) computes positions in grid units; positions are snapped to the grid.
  Manual overrides in `layout.json` win. Layout runs on the server and is
  saved, so the page never lays out.
- **Isometric drawing.** One projection function maps grid positions to the
  screen. A node is three faces of a box with a flat top carrying the icon and
  label. The floor is a dotted grid. Elements are depth-sorted.
- **Theme.** A palette (a preset or a custom palette) and a mode become CSS
  custom properties on the page; the stylesheet only refers to them. Presets
  carry a hand-picked dark variant; a custom palette without one gets a
  generated dark variant that keeps every hue and meets fixed contrast
  (text 7:1, muted text 4.5:1, accent and categories 3:1 on the background).
  Fonts are bundled as woff2 files and loaded before the scene is drawn, since
  labels are fitted by measuring them.
- **Edges.** The routed path is drawn on the floor. `flow` draws it in, then
  sends a dot along it; flowing dashes follow the timeline. The label sits on
  the longest visible segment, in a pill drawn above the nodes. Layout
  straightens jogs shorter than a grid step that snapping leaves in a route.
  Where the layout dropped a route (an end was overridden), the engine draws
  a simple orthogonal one: straight between boxes that share enough of a
  side, otherwise with one bend.
- **Overlays.** HTML on top of the SVG: callout cards, badges, step caption,
  narration caption, scene title. Anchored to projected node positions. The
  stage is split into bands inside the safe area: the scene title at the top
  left, the step caption under it, the narration caption along the bottom (at
  most two lines), and the content between them, where the scene is framed.
  A caption that is turned off gives its band to the content. A callout card
  sits beside its node, to the right if that side is free, else the left,
  above or below, sliding along a side before covering a box or an edge
  label. A badge stands on its node's back corner. Badge tones keep fixed
  hues in every palette (info is the accent, ok green, warn amber, error
  red), lightened or darkened to the accent's contrast.
- **Cards.** An optional title card opens the video and an optional end
  card closes it, set in `config.json` (see Config). The title card shows
  the title in the middle with the description under it. The end card
  shows the headline, then the link with its QR code beside it, then where
  to find the feature and the credit. The QR code is dark on a light tile
  in both modes, encodes the link as UTF-8, and grows with the link so a
  module stays at least 4 px at 720p. Only the title and the headline are
  required; every other line, and the logo, can be left out. Text wraps, to
  at most three lines for a title, headline or description. Cards have no
  step or narration caption.
- **Logo.** Drawn as an `<img>` (an SVG runs no script that way), fitted
  inside 200×64 px at 1080p in the chosen corner of the safe area, keeping
  its aspect ratio. On scene frames (`show: "all"`), the band in that
  corner leaves room for it. Without an end card and a title card, the
  ending shows it in the middle, fitted inside 480×160 px.
- **Timeline.** Our own, not GSAP. Tweens with eases, staggers and labels;
  `seek(t)` sets the whole scene from `t` alone, so any frame can be rendered
  in any order. The page exposes `__seek(t)`, `__duration` and `__cues`.
- **Timing.**
  1. Each action type has a default duration.
  2. A beat lasts max(narration length + 0.6 s, its actions at default speed
     + 0.6 s). Narration and actions start 0.3 s into the beat and end at
     least 0.3 s before its end. Without narration, a beat also lasts at
     least its caption length ÷ 15 characters per second.
  3. Actions run in order at their default length, with the spare time
     shared out after each; callouts stay until the narration ends, and
     badges until the scene ends.
  4. Narration longer than the caption band's two lines is split into cues,
     between sentences, else clauses, else words; each cue is on screen for
     its share of the line's characters. The cues are `__cues` and the `.srt`.
  5. Each scene is drawn on its own layer, framed to its own nodes, and
     scenes crossfade; a scene of a few nodes is not zoomed past a fixed
     largest scale. A scene draws only the edges it flows; its nodes
     without an `appear` are there from its start, and a zone's platform
     rises with the first of its nodes to appear.
  Before the Preview gate, narration length is estimated at 2.5 words per
  second; from the Preview gate on, it is measured from the audio.
- **Opening and ending.** A card holds for max(3 s, its text length ÷ 15
  characters per second). The title card is on screen from the first frame,
  and fades out over the scene transition (0.8 s) as the first scene fades
  in. The video ends the same way: the last scene fades out over the scene
  transition as the closing card fades in, and the card holds to the last
  frame. The closing card is the end card, or else the title card again,
  or else the logo in the middle. With none of them, the last scene fades
  to the empty background, which holds for 1.2 s.

## Audio

- **Voice.** A `TtsProvider` interface; v1 ships `kokoro-js` (Kokoro-82M ONNX,
  q8, about 92 MB, English voices). The model downloads on first use into
  the cache directory. Lines are generated when the project enters the Preview
  gate and cached by hash, so editing one line regenerates only that line.
- **Music.** Procedural, ported from the prototype's numpy code: three moods,
  each seeded, so a project always gets the same music.
- **Mix.** Music ducks under the voice; the mix is normalised to −16 LUFS
  integrated with a true peak at or below −1 dBTP.

## Checks

Checks run on the server against the preview page before rendering, and write
a JSON report that the Preview gate shows as warnings linked to beats.

| Check | Measured | Warns when |
|---|---|---|
| Overlap | Projected node-top polygons and overlay boxes, at each beat's midpoint | Two elements overlap by more than 4 px |
| Off frame | The same shapes | Anything leaves the 1920×1080 safe area (5% margin) |
| Reading speed | Caption characters ÷ seconds on screen | Above 15 characters per second |
| Narration fit | Voice length against beat length | A line would need speeding up by more than 1.05× |
| Loudness | ffmpeg `ebur128` on the final mix | Outside −16 ± 1 LUFS or true peak above −1 dBTP |

Layout problems go back to the layout engine first and to the LLM second.

The **contact sheet** is one still per beat on a single image.

## Rendering

- Playwright drives headless Chromium. The page is captured frame by frame at
  30 fps by seeking the timeline. 4 pages, each in a browser of its own,
  capture interleaved frames in parallel; they are put back in order and
  piped to one ffmpeg, so the video is identical to a one-page capture.
  Chromium rasterizes in full and in software, so a frame's pixels depend
  only on its time (decision 010).
- The page is built with Vite into `dist/render/` and served on `127.0.0.1`
  with the bundled fonts. The renderer puts the project's files on
  `window.__project` before the page loads; the page validates them again,
  draws them and exposes `__seek`, `__duration` and `__cues`. The dev page
  and the render page share one player, so what is previewed is what is
  rendered.
- ffmpeg encodes H.264 and AAC. Frames are piped to it as PNGs; 720p is
  captured at 1080p and scaled down.
- The poster is the title card when there is one. Otherwise it is the
  frame in the middle of the first scene's last beat, when that scene is
  fully drawn. Outputs go in `out/<timestamp>/<theme>/`.
- One render job runs at a time, in an in-process queue, with progress over
  SSE and a cancel button.
- Outputs per theme (light, dark or both):
  - `video.mp4`: with captions and audio
  - `video-clean.mp4`: no burned-in captions, with audio
  - `captions.srt`
  - `audio.wav`
  - `poster.png`
  - `contact-sheet.png`

## LLM

- Vercel AI SDK. Providers: OpenRouter (default) and any OpenAI-compatible
  endpoint (OpenAI, Ollama, LM Studio). Settings: base URL, API key, model.
  One model for every call in v1.
- One structured call per gate, each with its own zod schema:
  - **Graph:** the chat and context in, `graph.json` out. Streamed, so the
    Mermaid view builds up live.
  - **Script:** the approved graph in, `storyboard.json` out.
  - **Edit:** a chat message and the current JSON in, a JSON Patch out, so the
    model cannot silently drop parts it was not asked to change.
- Every result is validated (schema, then references between graph and
  storyboard, then the checks that apply). Errors are sent back to the model,
  at most twice.
- Prompts live in `src/llm/prompts/` as Markdown files.
- Context: pasted text and uploaded `.md`, `.txt`, `.mmd` and source files, up
  to about 100,000 characters in total. Above that the user is asked to trim;
  nothing is summarised silently.
- The README lists models tested for structured output. Local models are best
  effort.

## MCP

The running app serves an MCP endpoint at `http://127.0.0.1:3000/mcp`
(Streamable HTTP), using the official MCP TypeScript SDK. It shares the
process, project folders, render queue and preview pages with the web app, and
works the same under Docker. The app must be running for the IDE to connect.

In MCP mode explAIn-it makes no LLM calls. The IDE's agent reads the user's
repository, writes the graph and storyboard, and calls the tools below. The
server validates, lays out, checks, previews and renders.

| Tool | Does | Returns |
|---|---|---|
| `get_guide` | Reads the authoring guide | The guide as text, the same as `explain_flow` |
| `list_projects` | Lists projects | Names, gates, last update |
| `get_project` | Reads one project | Its files and the current gate |
| `create_project` | Creates a project from a graph, with optional `sources` | Validation errors or the Mermaid, and a preview link |
| `update_graph` | Replaces the graph or applies a JSON Patch | Errors or the Mermaid; stale beats |
| `set_storyboard` | Replaces the storyboard or applies a JSON Patch | Errors, estimated timing, check warnings |
| `set_style` | Updates `config.json` | The config, a preview link |
| `check` | Generates the voice if needed and runs the checks | The report and the contact sheet as an image; until the voice and the checks exist (milestone 2), whether the project can render, its problems, stale beats and timing, and what it could not check |
| `render` | Queues a render | A job id |
| `render_status` | Reads a render job | Progress, then the output paths |
| `cancel_render` | Cancels a queued or running render | The job; no partial files are left |

The endpoint is stateless: each POST gets a fresh MCP server on the shared
projects and answers with JSON; GET and DELETE answer 405. It sits behind
the same host and origin checks as the API. Tool arguments are checked by
the project's own schemas, so an error names its place
(`graph.nodes[2].kind: …`) the way the rest of the app does, and an error
about a project ends with its preview link. A JSON Patch is RFC 6902.
`set_style`'s settings merge like a JSON Merge Patch (RFC 7386): objects
merge, `null` removes, anything else replaces. A logo comes as an absolute
file path or a data URL and is checked like any logo before it is copied
into `assets/`; a logo named in the settings must already be there. Graph
changes are laid out again at once, keeping manual positions, and
`update_graph` also lists the storyboard lines the new graph breaks. A
broken `layout.json` or `config.json` that a tool replaces is reported as a
warning. Changes to one project are made one at a time. Gates only move
forward as files arrive (graph, then script, then style); approval happens
in the IDE's chat. Every change is announced over SSE, so an open preview
page follows along. Decision 011 says why.

**Guidance.** An MCP prompt, `explain_flow`, and the tool descriptions carry
what the agent needs to write good files: the schemas, the limits, the node
kinds and actions, how to tell the story in beats, and when to stop for the
user's approval. The in-app LLM prompts are built from the same guidance.
The guide is one text in `src/guidance/` (`authoringGuide()`): the file
formats are generated from the zod schemas as TypeScript-like types, with
every field, limit, default and description, and the other lists come
from the code, so it cannot drift from what the tools accept. The prompt takes an optional
`topic`. An agent cannot open a prompt by itself (an IDE offers it to the
user, as a slash command in Claude Code), so `get_guide` returns the same
text, and the graph and storyboard tools carry a short summary of their
format that points at it.

**Approval.** The prompt tells the agent to show the user the Mermaid, then
the script, in the IDE chat and to wait for approval before moving on. Every
tool result includes a link to the project in the web app for a visual
preview. The server never blocks a render on approval. MCP elicitation may
replace this once clients support it widely.

**Projects** created over MCP live in the server's `projects/` folder, like any
other. Exporting a project into the user's repository comes later.

**Setup.** The README gives a one-line configuration for Claude Code, Cursor
and VS Code. A stdio shim that starts the app when it is not running comes later.

## Mermaid

- Input: `flowchart` (and `graph`) only. Subgraphs become zones.
- Parsing uses the full `mermaid` package (pinned version) with jsdom globals
  on the server, reading nodes, edges and subgraphs from the diagram's
  internal database. This is not a public Mermaid API, so it is wrapped in one
  module with round-trip tests.
- The web UI renders Mermaid on the client.

## App and stack

- Node 24 LTS, TypeScript (strict), one npm package.
- Web: Vite and React. Server: Hono. Progress: Server-Sent Events.
- `npm run dev` for development. `npm start` runs one Node process that
  serves the built UI and the API.
- The server listens on `127.0.0.1:3000` by default. No login, no telemetry.
  `HOST` and `PORT` change where it listens, `PROJECTS_DIR` where the
  projects folder is (`./projects` by default), and `PUBLIC_URL` the
  address preview links use when the app sits behind a proxy, as it does
  under `npm run dev`. With no login, the API
  answers only its own pages: it refuses requests addressed to another host
  name (DNS rebinding) or sent from another site's page, takes request bodies
  only as JSON (which a cross-site form cannot send), and caps them at 1 MB.
  Uploaded files are checked by type and size.
- Keys: read from `.env`; the settings page writes to it. Docker users pass
  `-e OPENROUTER_API_KEY=…`.
- Visuals: Lucide icons (ISC); about 8 bundled OFL fonts; about 6 palettes,
  each with light and dark variants.
- Layout: elkjs (EPL-2.0, used as a dependency).
- Tests: Vitest. LLM calls are recorded as fixtures and replayed in CI, so CI
  needs no API key. Example projects are rendered to stills and compared
  against golden images.
- Lint and format: Biome.

### CLI

```text
explain-it render <project> [--theme light|dark|both] [--resolution 720p]
explain-it check  <project>
```

Creating and editing projects happens in the web UI.

### Docker

A slim Node base with Chromium and ffmpeg, published to GHCR from CI. The
voice model is not in the image.

```sh
docker run -p 127.0.0.1:3000:3000 \
  -v ./projects:/app/projects -v ./cache:/app/cache \
  -e OPENROUTER_API_KEY=... ghcr.io/bybash/explain-it
```

Supported: macOS and Linux natively; Windows through Docker.

## Repository layout

```text
src/
  schema/      zod schemas for graph, storyboard, config, project
  layout/      elkjs layout, grid snapping, overrides
  engine/      iso, edges, overlays, timeline, theme (browser)
  audio/       tts providers, music, mix
  checks/      overlap, frame, reading speed, narration fit, loudness, contact sheet
  render/      capture, encode, outputs, job queue
  mermaid/     parse and generate
  guidance/    authoring guidance shared by the MCP prompt and the LLM prompts
  llm/         client, calls, repair loop, prompts/, fixtures
  mcp/         MCP endpoint and tools
  server/      Hono app, projects API, SSE, settings
  web/         React app: chat, gates, panels, player
  cli/         render and check
assets/        bundled fonts with their licences (palettes are in src/engine/theme; icons come from lucide)
examples/      oauth-login, ci-pipeline, checkout (approved projects)
schemas/       generated JSON Schemas
docs/          ARCHITECTURE.md and other docs
```

## Examples

Three approved example projects in `examples/`, which render without an API
key and also serve as test fixtures:

- **OAuth login**: browser, app, identity provider, token exchange.
- **CI pipeline**: commit, build, test, deploy, with a failure branch.
- **Checkout**: cart, payment provider, inventory, confirmation email.

## Milestones

1. **Engine.** The CLI renders a hand-written example to MP4, with no LLM and
   no voice.
2. **Audio and checks.** Voice, narration-first timing, music, mix, checks,
   contact sheet.
3. **Web app.** The five gates, Mermaid round-trip, editors, preview, render queue.
4. **MCP.** The endpoint, the tools and the `explain_flow` prompt: the first
   way to make a video end to end, from the IDE, with no LLM in explAIn-it.
5. **LLM.** Graph and script drafting in the web app, repair loops, edits
   through chat.
6. **Ship.** Docker on GHCR, three examples, docs, v0.1.0.

The pull requests that make up each milestone are listed in [`ROADMAP.md`](ROADMAP.md).

## Licences

- explAIn-it is MIT. The videos people make are theirs.
- Dependencies: Mermaid (MIT), Playwright (Apache-2.0), Kokoro-82M and
  kokoro-js (Apache-2.0), AI SDK (Apache-2.0), MCP TypeScript SDK (MIT),
  fast-json-patch (MIT),
  Lucide (ISC), elkjs (EPL-2.0), qrcode-generator (MIT, the end card's QR
  code; jsQR, Apache-2.0, checks it in tests),
  fonts (OFL), ffmpeg (LGPL/GPL, called as a separate program).
- No GSAP and no MusicGen.
