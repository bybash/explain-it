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

**Done when** lists what the reviewer checks before merging.

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
| 1.6 | **Theme**: tokens, light and dark, the palette presets, bundled fonts, Lucide icons on node tops | Screenshots of the example in two palettes, light and dark |
| 1.7 | **Overlays**: callout cards, badges, step and narration captions, the scene title, anchored to projected nodes | Screenshots in the PR |
| 1.8 | **Beat builder**: storyboard to timeline, default action durations, estimated narration length, scene transitions; exposes `__seek`, `__duration`, `__cues` | The example plays end to end in the dev page |
| 1.9 | **Capture and CLI render**: Playwright frame capture, ffmpeg encoding, `.srt`, poster, `explain-it render` | `explain-it render examples/oauth-login` writes an MP4, attached to the PR |
| 1.10 | **Parallel capture**: 4 pages each render a chunk; chunks are joined | The output is identical to 1.9 and faster; timings in the PR |

## Milestone 2: audio and checks

| ID | Slice | Done when |
|---|---|---|
| 2.1 | **Voice**: the `TtsProvider` interface, the kokoro-js provider, model download into the cache, per-line hash cache | A test generates a line; the second run hits the cache |
| 2.2 | **Narration-first timing**: measured voice lengths drive beat lengths | The example's beats follow its narration; the cues line up |
| 2.3 | **Music**: three procedural moods, seeded, ported from the prototype | Three short samples attached to the PR |
| 2.4 | **Mix and outputs**: ducking, −16 LUFS normalisation, muxing; the captioned and clean MP4s, `audio.wav`, light, dark and both | The example renders with voice and music |
| 2.5 | **Layout checks**: overlap (polygons) and off-frame at each beat's midpoint, including boxes moved onto each other or onto another zone by manual overrides; a JSON report; `explain-it check` | A broken fixture is caught; an overlapping override is reported; the example passes |
| 2.6 | **Timing and audio checks**: reading speed, narration fit, loudness | Same as 2.5 |
| 2.7 | **Contact sheet**: one still per beat on one image | A contact sheet of the example in the PR |

## Milestone 3: web app

| ID | Slice | Done when |
|---|---|---|
| 3.1 | **Server and shell**: Hono, the projects API over folders, SSE, `127.0.0.1` by default, a Vite and React shell listing projects, `npm run dev` and `npm start` | Projects can be created, listed and opened |
| 3.2 | **Settings**: base URL, key and model read from and written to `.env`; keys are never logged or sent to the browser in full | Settings round-trip; the key is masked in the UI |
| 3.3 | **Chat and gates**: the chat column, the gate stepper, the split layout, `chat.jsonl`; no LLM yet (a stub reply) | Messages persist across restarts |
| 3.4 | **Mermaid round-trip**: Mermaid to graph (jsdom, pinned version) and graph to Mermaid, keeping kind, icon and category by id | Round-trip tests on all examples and a set of Mermaid fixtures |
| 3.5 | **Graph gate panel**: a Mermaid editor with the rendered diagram, approve and edit | Editing the Mermaid updates `graph.json` |
| 3.6 | **Script gate panel**: the scene and beat editor; stale beats after graph edits | Changing a node marks only its beats as stale |
| 3.7 | **Style gate panel**: palettes, custom palette, fonts and font upload, voice picker with a sample, captions, music, output | Changes show in the preview straight away |
| 3.8 | **Preview gate**: the player with a scrubber and beat list, voice generation with progress, check warnings that jump to the beat, the contact sheet | The example can be previewed with voice |
| 3.9 | **Render gate**: the job queue, progress over SSE, cancel, downloads | The example renders from the UI |

## Milestone 4: MCP

The goal: make a video end to end from an IDE, with no LLM in explAIn-it.

| ID | Slice | Done when |
|---|---|---|
| 4.1 | **MCP endpoint and project tools**: `/mcp` over Streamable HTTP with the MCP TypeScript SDK; `list_projects`, `get_project`, `create_project`, `update_graph`, `set_storyboard`, `set_style`; `origin` and `sources` on the project; a preview link in every result | Tests call each tool through an in-memory MCP client; invalid input returns readable errors |
| 4.2 | **Guidance and the `explain_flow` prompt**: authoring guidance in `src/guidance/` (schemas, limits, node kinds, actions, beats, approval steps), served as an MCP prompt and in the tool descriptions | The prompt lists correctly in an MCP client; the guidance is one source the LLM slices can reuse |
| 4.3 | **Check and render tools**: `check` (voice, checks, contact sheet returned as an image), `render`, `render_status` | A test project goes from `create_project` to an MP4 through tools alone |
| 4.4 | **IDE setup**: README configuration for Claude Code, Cursor and VS Code; a walkthrough explaining a feature of this repository | A video of an explAIn-it feature made from Claude Code, attached to the PR |

## Milestone 5: LLM in the web app

| ID | Slice | Done when |
|---|---|---|
| 5.1 | **LLM client**: AI SDK with OpenRouter and OpenAI-compatible providers, structured calls, the repair loop, fixture recording and replay | Tests replay fixtures without a key |
| 5.2 | **Context**: pasted text and file upload, the 100k-character limit, storing files in `context/` | Oversized context is refused with a clear message |
| 5.3 | **Graph drafting**: chat and context to `graph.json`, streamed into the Mermaid view, at most two questions | Fixtures: three described flows give valid graphs |
| 5.4 | **Script drafting**: graph to scenes and beats, validated by the schema and the checks, repaired on failure | Fixtures: the three graphs give valid storyboards |
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

## Later

- Sequence diagrams; images as input.
- Git repository exploration inside the web app (the place where an agent
  framework such as LangGraph may fit).
- MCP: exporting a project into the user's repository, a stdio shim that
  starts the app, elicitation for approvals, a check that lists `sources`
  changed since the video was made.
- More voices and languages, 9:16 vertical, GIF output, camera moves within a
  scene.
