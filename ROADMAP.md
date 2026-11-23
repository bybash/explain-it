# Roadmap

v1 is built as a series of small pull requests. Each one does one thing, can
be reviewed in one sitting, and leaves `main` working. The design is in
[`SPEC.md`](SPEC.md).

## How we work

1. Each slice below is one pull request. Its title is a
   [Conventional Commits](https://www.conventionalcommits.org/) title ending
   with the slice ID, for example `feat(engine): isometric primitives [1.3]`.
   There are no issues for slices; this file is the backlog.
2. Work happens on a branch named after the slice: `1.3-isometric-primitives`.
3. The pull request says what to look at and shows the result: test output,
   a screenshot, a still or a short clip.
4. CI must pass (lint, typecheck, tests). `main` is protected: changes go in
   only through pull requests.
5. A maintainer reviews, then the PR is squash-merged. The PR title becomes
   the commit title on `main`.
6. If review changes the design, the same PR updates `SPEC.md`.
7. The slice's PR also marks it done here by adding ✅ before its ID.
8. Anything the slice deliberately leaves out goes under **Carried over**
   below, named for the slice that should pick it up. That slice removes the
   items it finishes. Problems found outside the slice go there too.

**Done when** lists what the reviewer checks before merging.

## Order

Slices keep their IDs, but after Milestone 1 they are built in this order:

1. **3.1** Server and shell: the MCP endpoint lives on the app server.
2. **4.1 to 4.4**, MCP: the first way to make a video end to end
   (decision 002), silent with captions until audio comes.
3. **Milestone 2**, audio and checks.
4. **3.2 to 3.5**, then **3.10** (the app's styles in Tailwind, before the
   remaining panels add more CSS), then **3.7**, **3.11**, **3.8**, **3.13**,
   **3.9** and **3.12**: the rest of the web app.
5. **Milestones 5 and 6**, as listed, with **3.6** (the script gate's panel)
   just before **5.4**: until the LLM drafts scripts, a script comes over MCP,
   and nothing blocks on editing it in the app.
6. **Milestone 7**, share outputs: not placed in the order yet. Its open
   questions (below the table) are settled first, in a decision record.

Audio waits because the engine already renders a complete silent video.
MCP needs only the server to reach a finished video from the IDE, whereas
the web app needs all of Milestone 3 and the LLM. Where an MCP slice needs
audio, it leaves that part under **Carried over** for the Milestone 2 slice
that adds it. For example, 4.3's `check` reports voice and the contact sheet
only once 2.1 and 2.7 exist.

## Milestone 0: repository

| ID | Slice | Done when |
|---|---|---|
| ✅ 0.1 | **Repository basics**: `README`, `SPEC.md`, `ROADMAP.md`, `CONTRIBUTING.md`, `AGENTS.md` and `CLAUDE.md` for coding agents, `.gitignore`, pull request and issue templates | The docs read well; an agent opening the repo knows how to pick up the next slice |
| ✅ 0.2 | **Tooling**: `package.json`, TypeScript strict, Vitest, Biome, `.nvmrc` (Node 24), a GitHub Actions workflow running lint, typecheck and tests | CI is green on a trivial test |

## Milestone 1: engine

The goal: the CLI renders a hand-written example to an MP4, with no LLM and no voice.

| ID | Slice | Done when |
|---|---|---|
| ✅ 1.1 | **Schemas**: zod schemas for graph, storyboard, config and project; cross-reference validation (beats refer to existing nodes and edges) with errors that name the exact field; the shared `Result` type; JSON Schema generation with a CI check that generated files are current; dependency-cruiser boundary rules in CI; `fast-check`; the hand-written `examples/oauth-login` graph and storyboard | Tests, written first, cover valid and invalid documents; the example validates; CI fails on a stale `schemas/` file or a forbidden import |
| ✅ 1.2 | **Timeline core**: tweens, eases, staggers, labels, a pure `seek(t)`, `duration` | Unit tests show seeking forwards, backwards and out of order gives identical state |
| ✅ 1.3 | **Isometric primitives**: projection, boxes with three faces, node tops, the dotted floor, zone platforms, depth sorting; a dev page showing a static scene with fixed positions | A screenshot of the dev page in the PR |
| ✅ 1.4 | **Layout**: elkjs layered layout with orthogonal routing, zones as compound nodes, grid snapping, manual overrides, writing `layout.json` | Tests: no overlapping boxes on the example; no zone platform reaches under a node outside the zone; overrides win |
| ✅ 1.5 | **Edges**: routed paths on the floor, draw-in, the moving dot, flowing dashes driven by the timeline, labels on the longest segment; a simple orthogonal fallback route where the layout dropped one (an overridden end); no near-zero jogs left by grid snapping | A short clip of the dev page in the PR; tests for the fallback route and for jog removal |
| ✅ 1.6 | **Theme**: tokens, light and dark, the palette presets, bundled fonts, Lucide icons on node tops | Screenshots of the example in two palettes, light and dark |
| ✅ 1.7 | **Overlays**: callout cards, badges, step and narration captions, the scene title, anchored to projected nodes | Screenshots in the PR |
| ✅ 1.8 | **Beat builder**: storyboard to timeline, default action durations, estimated narration length, scene transitions; exposes `__seek`, `__duration`, `__cues` | The example plays end to end in the dev page |
| ✅ 1.9 | **Capture and CLI render**: Playwright frame capture, ffmpeg encoding, `.srt`, poster, `explain-it render` | `explain-it render examples/oauth-login` writes an MP4, attached to the PR |
| ✅ 1.10 | **Parallel capture**: 4 pages, each in its own browser, capture interleaved frames; they are put back in order for one ffmpeg (decision 010) | The output is identical to 1.9 and faster; timings in the PR |
| ✅ 1.11 | **Title card and logo**: `cards.title` and `logo` in the config schema; logo files in `assets/` (PNG, JPG or SVG, light and dark); the title card on screen from the first frame, held max(3 s, reading time), fading into the first scene; the logo in its corner on the title card or every frame; the poster is the title card (SPEC, Cards, Logo, Opening and ending; decision 009) | The example renders with a title card and its logo; stills of both, light and dark, in the PR |
| ✅ 1.12 | **End card and ending**: `cards.end` in the config schema; the headline, link with its QR code, where to find the feature and credit; the last scene fades out and the closing card (end card, else title card, else the logo in the middle) fades in and holds to the last frame (SPEC, Cards, Opening and ending; decision 009) | The example ends on its end card with a scannable QR code; stills of the three closing cards, light and dark, in the PR |

## Milestone 2: audio and checks

| ID | Slice | Done when |
|---|---|---|
| ✅ 2.1 | **Voice**: the `TtsProvider` interface, the kokoro-js provider, model download into the cache, per-line hash cache | A test generates a line; the second run hits the cache |
| ✅ 2.2 | **Narration-first timing**: measured voice lengths drive beat lengths | The example's beats follow its narration; the cues line up |
| ✅ 2.3 | **Music**: three procedural moods, seeded, ported from the prototype | Three short samples attached to the PR |
| ✅ 2.4 | **Mix and outputs**: ducking, −16 LUFS normalisation, muxing; the captioned and clean MP4s, `audio.wav`, light, dark and both | The example renders with voice and music |
| ✅ 2.5 | **Layout checks**: overlap (polygons) and off-frame at each beat's midpoint, including boxes moved onto each other or onto another zone by manual overrides; a JSON report; `explain-it check` | A broken fixture is caught; an overlapping override is reported; the example passes |
| ✅ 2.6 | **Timing and audio checks**: reading speed, narration fit, loudness | Same as 2.5 |
| ✅ 2.7 | **Contact sheet**: one still per beat on one image | A contact sheet of the example in the PR |

## Milestone 3: web app

| ID | Slice | Done when |
|---|---|---|
| ✅ 3.1 | **Server and shell**: Hono, the projects API over folders, SSE, `127.0.0.1` by default, a Vite and React shell listing projects, `npm run dev` and `npm start` | Projects can be created, listed and opened |
| ✅ 3.2 | **Settings**: base URL, key and model read from and written to `.env`; keys are never logged or sent to the browser in full | Settings round-trip; the key is masked in the UI |
| ✅ 3.3 | **Chat and gates**: the chat column, the gate stepper, the split layout, `chat.jsonl`; no LLM yet (a stub reply) | Messages persist across restarts |
| ✅ 3.4 | **Mermaid round-trip**: Mermaid to graph (jsdom, pinned version) and graph to Mermaid, keeping kind, icon and category by id | Round-trip tests on all examples and a set of Mermaid fixtures |
| ✅ 3.5 | **Graph gate panel**: a Mermaid editor with the rendered diagram, approve and edit | Editing the Mermaid updates `graph.json` |
| 3.6 | **Script gate panel**: the scene and beat editor; stale beats after graph edits | Changing a node marks only its beats as stale |
| ✅ 3.7 | **Style gate panel, the look**: palette and mode, font, title and end cards, logo upload, output, with a live preview drawn by the render player | Changes show in the preview straight away |
| ✅ 3.8 | **Preview gate**: the player with its sound (the voice generated with progress, mixed as the render mixes it), play and pause, a scrubber and the beat list | The example can be previewed with voice |
| 3.9 | **Render gate**: the job queue, progress over SSE, cancel, downloads | The example renders from the UI |
| ✅ 3.11 | **Style gate panel, the sound**: voice picker with a sample, voice speed, pacing, captions, music | A voice sample plays from the panel |
| ✅ 3.13 | **Preview gate checks**: run the checks from the panel, warnings that jump to their beat, the contact sheet | A warning in the example jumps to its beat |
| 3.12 | **Style extras**: a custom palette editor, font upload | A custom palette and an uploaded font show in the preview and the render |
| ✅ 3.10 | **App styles in Tailwind**: Tailwind v4 through its Vite plugin; the colour tokens and the dark set become `@theme` values; `app.css` moves to utility classes, keeping plain CSS only for CodeMirror's and Mermaid's own classes; the video's styles (`src/engine/`) are untouched; a decision record | Screenshots of each page, light and dark, look the same before and after |

## Milestone 4: MCP

The goal: make a video end to end from an IDE, with no LLM in explAIn-it.

| ID | Slice | Done when |
|---|---|---|
| ✅ 4.1 | **MCP endpoint and project tools**: `/mcp` over Streamable HTTP with the MCP TypeScript SDK; `list_projects`, `get_project`, `create_project`, `update_graph`, `set_storyboard`, `set_style` (with the cards, and the logo as a file path or data URL copied into `assets/`); `origin` and `sources` on the project; a preview link in every result | Tests call each tool through an in-memory MCP client; invalid input returns readable errors |
| ✅ 4.2 | **Guidance and the `explain_flow` prompt**: authoring guidance in `src/guidance/` (schemas, limits, node kinds, actions, beats, approval steps), served as an MCP prompt and in the tool descriptions | The prompt lists correctly in an MCP client; the guidance is one source the LLM slices can reuse |
| ✅ 4.3 | **Check and render tools**: `check` (voice, checks, contact sheet returned as an image), `render`, `render_status` | A test project goes from `create_project` to an MP4 through tools alone |
| ✅ 4.4 | **IDE setup**: README configuration for Claude Code, Cursor and VS Code; a walkthrough explaining a feature of this repository | A video of an explAIn-it feature made from Claude Code, attached to the PR |

## Milestone 5: LLM in the web app

| ID | Slice | Done when |
|---|---|---|
| 5.1 | **LLM client**: AI SDK with OpenRouter and OpenAI-compatible providers, structured calls, the repair loop, fixture recording and replay | Tests replay fixtures without a key |
| 5.2 | **Context**: pasted text and file upload, the 100k-character limit, storing files in `context/` | Oversized context is refused with a clear message |
| 5.3 | **Graph drafting**: chat and context to `graph.json`, streamed into the Mermaid view, at most two questions | Fixtures: three described flows give valid graphs |
| 5.4 | **Script drafting**: graph to scenes and beats, and a suggested title card, validated by the schema and the checks, repaired on failure | Fixtures: the three graphs give valid storyboards |
| 5.5 | **Edits through chat**: JSON Patches for the graph and the storyboard | Fixtures: "rename X", "add a retry step", "shorten beat 3" |
| 5.6 | **Layout repair**: check failures the layout engine cannot fix go back to the LLM | A crowded fixture is fixed |

## Milestone 6: ship

| ID | Slice | Done when |
|---|---|---|
| 6.1 | **Docker**: a slim image with Chromium and ffmpeg, volumes for projects and cache, a GHCR publish workflow on tags | `docker run` works on a clean machine |
| 6.2 | **Examples**: `ci-pipeline` and `checkout`, approved and rendered | All three examples render without a key |
| 6.3 | **Golden stills in CI**: stills of each example compared against stored images | CI fails on a visual regression |
| 6.4 | **Docs**: README with a demo video, `docs/ARCHITECTURE.md`, final `CONTRIBUTING.md`, tested models list | A new contributor can run the app from the README alone |
| 6.5 | **Release v0.1.0**: changelog, tag, image | The release is published |

## Milestone 7: share outputs

The goal: explain a code change, a new feature or an idea where people
already read (Slack, Jira, Notion, a PR), to readers who skip long PRs and
documents. Each output is made from the same project (graph, script,
renderer), so the outputs and the video always agree.

| ID | Slice | Done when |
|---|---|---|
| 7.1 | **Storyboard strip**: 4 to 8 stills, each with its caption, as one image, built on the contact sheet's page (2.7); exported from MCP and the render gate | The example's strip reads without sound and posts to Slack under 1 MB |
| 7.2 | **GIF clip**: one scene, at most 15 s, captions burned in, no sound, from the renderer and ffmpeg | A scene of the example plays inline in Slack and in a GitHub comment, under 5 MB |
| 7.3 | **Diagram export**: the graph as SVG and PNG, plus its Mermaid text (3.4) | The example's diagram pastes into Notion, and its Mermaid draws on GitHub |
| 7.4 | **TL;DR card and summary**: a title, at most three bullets (what changed, why, what to look at) and a still, as one image; and a short Markdown summary from the script's captions | The example gives a card that reads at a glance and a summary for a PR body |
| 7.5 | **Change explainer over MCP**: an `explain_change` prompt and tool. The agent, which already has the diff, drafts the components a change touches as the graph, then before, after and what to review as the script, and gets the GIF, the card and the summary back | A pull request in this repository gets its explainer posted by the agent |
| 7.6 | **Interactive page**: one self-contained HTML file with the player and the beat list, clicking a beat to go to it | The file opens offline in a browser and plays the example |

Open questions, settled before the milestone starts:

- **Sharing beyond the machine.** The SPEC keeps everything local, with no
  login. Files (image, GIF, Markdown, an HTML file) fit that. Hosted links,
  link unfurls and Slack or Jira apps would change the SPEC.
- **Trust.** An explainer of a change should say what it covered. Checking
  a video against the source code is a v1 non-goal; `sources` is recorded
  but not checked yet, and that check would back the change explainer.
- **Limits per format** (GIF length, card bullets, strip stills) live in
  the zod schemas, as every other limit does, so the LLM's drafts keep to
  them.

## Carried over

Work a finished slice left for a later one. Each list is removed by the slice
that finishes it.

### For 5.4 (script drafting), from 2.6 and 3.13

- `set_storyboard`, and the script drafting's repair loop, could use the
  quick checks (reading speed and narration fit, pure, in
  `src/checks/timing.ts`) without Chrome; the layout checks need Chrome and
  loudness a mix. The Preview gate runs them all from its Checks tab.

### For 3.9 (render gate), from 2.1, 2.2, 2.4 and 3.8

- A render job shows no progress while it speaks or mixes, and a cancel
  waits for a model download already under way. The Preview gate already
  speaks every line with progress (`generateVoice`'s `onProgress`), so a
  render after a preview finds them cached; the render's own soundtrack is
  mixed again, though the preview's (`cache/preview/<key>.wav`) is the same
  mix.
- A render captures every frame twice (captioned and clean), about twice
  the time; the music takes 1.4–2.8 s per 75 s to make. If renders feel slow,
  cache the music keyed by mood, seed and length, as the voice is, or make
  the clean video optional.
- Old lines stay in `cache/tts/` when a line is edited; nothing prunes
  them yet.

### For 3.12 (style extras), from 3.7

- The palette select shows a custom palette set over MCP as "Custom" but
  cannot edit it.
- `fontFor` (`src/engine/theme/fonts.ts`) knows only bundled fonts; an
  uploaded one needs the renderer, the checks and the preview to load it
  from the project's `assets/`.
- Taking a saved logo out leaves its file in `assets/`; nothing removes
  files the config no longer names, as with old voice lines in `cache/`.
- The checks' `filesKey` (`src/render/check-files.ts`) covers the config,
  not the files in `assets/`: an uploaded font, or a logo file replaced
  under the same name, leaves an older report marked up to date. Hash the
  files the config names once fonts can be uploaded.

### For 5.6 (layout repair), from 2.5

- The layout engine now keeps routes in sight of boxes and places edge
  labels and badges clear of boxes and of each other; the example passes
  its checks. What it cannot fix stays a warning in `checks.json`, which
  5.6 sends to the LLM. On a crowded line a label may sit a few label
  heights off its line (the example's "save session").
- Not checked yet: the title and end cards, and edges against zone labels.

### For 3.9 (render gate), from 4.3

- The render queue exists: `RenderQueue` in `src/render/queue.ts`, one
  per app, shared with MCP. It runs one job at a time, can cancel a queued
  or running job, and announces every change as a `render` event on
  `/api/events`. 3.9 adds the UI, an API for it, and downloads.
- Jobs are kept in memory, so a restart forgets them; their files stay in
  the project's `out/`. Progress counts the whole job (each theme the
  same), and a cancelled or failed render removes its `out/<time>/` folder.

### For 3.9 (render gate), from 1.10

- Keep one render job at a time, with themes rendered one after the other.
  One 4-page render nearly fills the machine: 4 browsers capture about
  61 fps, and 8 only about 68. Two renders at once each run at about half
  speed. The example's light and dark together took 78 s, against about
  82 s one after the other, with twice the Chrome processes in memory.
- Overlapping renders are still correct: light and dark rendered together
  came out byte-identical to each rendered alone. The queue is for speed and
  memory, not for determinism.
- The page count defaults to 4 (`PAGES` in `src/render/render.ts`; only
  tests pass `pages`). On a machine with many more cores, choosing it from
  the CPU count would help more than running jobs side by side.

### For 5.1 (LLM client), from 3.2

- `settingsStore(...).current()` in `src/server/settings.ts` gives the base
  URL, model and full key, read fresh from `.env` on each call; the client
  takes them from there. The page checks nothing against the provider: a
  wrong key or model shows up only on the first call, so 5.1 should name it
  plainly ("the key was refused by openrouter.ai"). The suggested model
  `anthropic/claude-sonnet-5.5` (`SUGGESTED_MODEL`) is unchecked; confirm
  the id when recording the first fixtures.

### For 3.6 to 3.9 (gate panels), from 3.3 and 3.5

- Each gate's panel replaces the placeholder in `GatePanel`
  (`src/web/ProjectView.tsx`), as `GraphPanel` does for the graph gate;
  a panel tells `GatePanel` through `blocked` when the gate cannot be
  approved yet (unsaved edits). Approving the script gate needs
  `storyboard.json`, valid (`src/server/gates.ts`); the other gates need
  nothing yet. A panel that needs a large library loads it with the panel
  (`lazy`), as the graph editor does.
- The end-to-end test (`src/server/web-e2e.test.ts`) runs the app as
  `npm start` and as `npm run dev` on ports of its own; each panel slice
  adds its gate's steps to its flow. It needs Chrome, so CI skips it.
- SPEC's preview gate says "jump to a beat and edit it": 3.8's beat list
  (`src/web/PreviewBeats.tsx`) jumps, and so does a warning in the Checks
  tab (3.13); editing a beat there can reuse 3.6's beat editor once it
  exists.
- 3.6's stale beats come from saving the graph: `saveGraph`
  (`src/server/graphs.ts`) marks them in `project.json`, as MCP's
  `update_graph` does.

### For 5.5 (edits through chat), from 3.3

- Chat messages are saved with the gate they were sent at, and each gets
  `STUB_REPLY` (`src/server/chat.ts`). The LLM replaces the stub; approving
  by chat ("looks good") waits for it too, since only the LLM can tell what
  the user means.

### For 5.3 (graph drafting), from 4.2

- The authoring guide is `authoringGuide()` in `src/guidance/guide.ts`,
  with every limit and list taken from the schemas, and a worked example
  in `src/guidance/example.ts` that a test validates. The in-app LLM's
  prompts for graph and script drafting (5.3, 5.4) should be built from
  it, not written again.

### For 6.1 (Docker), from 3.1

- `npm start` serves `dist/web`, so the image must run `npm run build`.
- The server listens on `127.0.0.1` unless `HOST` is set. Inside a
  container it must listen on `0.0.0.0`, so the image sets `HOST=0.0.0.0`.
  The `docker run` line in SPEC publishes the port on `127.0.0.1` only.
- Projects live in `PROJECTS_DIR`, `./projects` by default. The image's
  volume should mount there.

### For 6.1 (Docker), from 1.9

- Rendering launches the local Chrome (`channel: "chrome"`), or the Chromium
  at `CHROME_PATH`; the image should set `CHROME_PATH`. `explain-it render`
  rebuilds the render page only when Vite is installed, so the image must
  run `npm run build:engine`.
- A render starts four Chrome processes (decision 010); give the container
  memory for them. Check that the image's Chromium still gives identical
  videos with 1 and 4 pages (the render test does).
- The end-to-end render test skips itself without Chrome or ffmpeg. Check
  that CI has both, or it never runs there.

### Found outside a slice

- Edge labels can overlap each other: in the example, the `authorization
  code` and `authorize` pills (label placement from 1.5).
- An edge label pill can cover a node's label: `GET /photos + token` over
  `Photos API` in the example's second scene (label placement from 1.5).
- A zone label can be hidden behind a node box: `Your…` behind `Web app`
  in the example's first scene (zones from 1.3 and 1.4).
- Seeking leaves stale attributes on hidden edges (points, dash offsets
  set by a later time). Nothing hidden is drawn, so frames are unaffected,
  but the DOM at time `t` depends on earlier seeks (edges from 1.5).

## Later

- Sequence diagrams; images as input.
- Git repository exploration inside the web app (the place where an agent
  framework such as LangGraph may fit).
- MCP: exporting a project into the user's repository, a stdio shim that
  starts the app, elicitation for approvals, a check that lists `sources`
  changed since the video was made.
- More voices and languages, 9:16 vertical, camera moves within a scene.
- More inputs for Milestone 7's outputs: a ticket or epic as a short idea
  pitch, a release as one card or clip per feature, a module as an
  onboarding walkthrough (as 4.4's walkthrough of this repository).
- The narration alone as audio, to listen to away from the screen.
