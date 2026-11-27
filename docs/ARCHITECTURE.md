# Architecture

How explAIn-it is built, for someone about to change it. What it does, and
why each part is the way it is, is in [`SPEC.md`](../SPEC.md) and the
decision records in [`decisions/`](decisions/README.md); the rules for code
and tests are in [`AGENTS.md`](../AGENTS.md).

## The shape of it

One TypeScript package, run by Node 24 without a build step (Node strips the
types). A user gets to a video along one of three paths, which meet in the
same project folder and the same renderer:

```text
 web app (React) ──HTTP/SSE──┐
 IDE agent ────────MCP───────┼──> server (Hono) ──> project folder ──> render page in Chrome ──> ffmpeg ──> MP4
 terminal ─────────CLI───────┘         │                                    (the engine)
                                       └── chat assistant ──> LLM (your key)
```

- The **web app** walks a project through five gates (Graph, Script, Style,
  Preview, Render) beside a chat with the assistant.
- An **IDE's agent** makes the same project through the MCP tools the server
  serves at `/mcp`.
- The **CLI** renders and checks a project folder directly.

A **project** is a folder of JSON files (`graph.json`, `storyboard.json`,
`layout.json`, `config.json`, `project.json`, optionally `brief.json`) plus
`assets/`, `cache/` (voices) and `out/` (renders). Every file has a zod
schema in `src/schema/` and a generated JSON Schema in `schemas/`.

## Functional core, imperative shell

```text
core (pure: no files, network, clock or randomness)
  schema/    the zod schemas: the only place a shape or a limit is defined
  layout/    elkjs layout of the graph onto the floor grid, routes, overrides
  engine/    the video as a function of time: timeline, isometric drawing,
             edges, overlays, cards, themes; runs in the browser
  mermaid/   graph ⇄ Mermaid
  guidance/  the authoring guide, built from the schemas
  checks/    layout, reading speed, narration fit, story, fixes

shell (input and output, behind small interfaces)
  server/    Hono: the projects API, SSE events, settings, the assistant's turns
  mcp/       the MCP endpoint and its tools
  render/    Chrome (Playwright), frame capture, ffmpeg, the render queue, the checks run
  audio/     Kokoro TTS, generated music, the mix and loudness
  llm/       the LLM client, structured calls with a repair loop, prompts, fixtures
  web/       the React app
  cli/       `explain-it render` and `explain-it check`
```

The shell calls the core; the core never calls the shell. dependency-cruiser
checks this and the other boundaries (`npm run deps`, `.dependency-cruiser.cjs`):
the web app talks to the server only over HTTP, and only `src/llm/` uses the
AI SDK.

The ports to the outside world are plain interfaces passed in as parameters,
each with a fake for tests: `TtsProvider`, `LlmClient`, the render run, the
clock (`now`) and the projects folder.

## The engine: a video is a function of time

`src/engine/beats/build.ts` turns the storyboard into a **plan**: scenes,
beats, cards and overlays on a timeline, each beat as long as its narration
(measured once the voice is generated, else estimated) or its reading time.
`timeline.ts` turns the plan's tweens into a pure `seek(t) → state`. The
**player** (`player.ts`) draws each scene once (isometric boxes, routed
edges, labels, overlays) and poses it for any `t`.

The same player runs in four places, so what you see is what renders:

- the **render page** (`src/engine/page/`), which Chrome loads to capture
  frames;
- the **preview** in the Style and Preview gates (`src/web/preview.ts`, in an
  iframe);
- the **checks**, which ask the page for the shapes drawn at each beat;
- the **dev page** (`dev/iso.html`), for working on the engine.

Nothing in the engine reads the clock or a random source, so the frame at
`t` is always the same: renders are repeatable, and the golden stills can
compare them.

## Rendering

`src/render/render.ts` serves the built render page, opens it in four
Chrome browsers, seeks each to its share of the frames, and pipes the PNGs in order
to one ffmpeg, which encodes H.264 with the mixed soundtrack. Each theme
gives a captioned video, a clean one, captions (`.srt`) and a poster, in
`out/<time>/<theme>/`. The **render queue** runs one job at a time and
reports progress over SSE.

## The checks

`src/render/check.ts` runs the project's page in Chrome, seeks to the middle
of each beat, and hands the shapes drawn there to the pure checks in
`src/checks/`: overlaps, anything off the safe area, reading speed,
narration fit, the story checks, and the mix's loudness (ffmpeg). They write
`checks.json` and a contact sheet. In the app, what they find is said in
the chat, with fixes to apply.

## The assistant

The chat in the web app is an agent (`src/llm/agent.ts`) with the same tools
an IDE agent gets over MCP, plus drafting tools that make one checked LLM
call each: draft the graph, draft the script from the brief, edit a file,
repair a layout. Every LLM answer is structured output checked against its
zod schema; what does not fit goes back to the LLM with the errors, named
by their place, a few times (`src/llm/structured.ts`).

Tests never call an LLM. `npm run llm:record` records each call, with the
model in `.env`, as a fixture in `src/llm/fixtures/`, keyed by a hash of its
prompt and schema; the tests replay them with no key. A change to a prompt,
the guide or a schema changes the hash, so the calls it touches are
recorded again.

## Tests

- **Unit and property tests** (Vitest, fast-check) on the core.
- **Integration**: the server API on a temporary folder, MCP through an
  in-memory client, the LLM through its recordings.
- **Chrome and ffmpeg**: the render test, the checks (with the mix's
  loudness), ffmpeg itself and the layout repair; they skip themselves
  where Chrome or ffmpeg is missing.
- **Golden stills**: each example's beats compared with `golden/`, in the
  Docker image's test stage, where they were made (`npm run golden:check`).
- **End to end**: Playwright drives the web app through every gate.

CI runs lint, typecheck, the module boundaries and the tests on every pull
request, the web app's browser tests among them, on the runner's Google
Chrome. A second job runs every test of the renderer and the checks, and
the golden stills, in the Docker image, where Chromium and ffmpeg are.

## Where to start

- A new field or limit: its zod schema in `src/schema/`, then
  `npm run schemas`.
- How something looks: `src/engine/`, with `npm run dev:engine`; then
  `npm run golden` and look at the difference.
- A new gate panel or chat behaviour: `src/web/` and its API in
  `src/server/`.
- A new MCP tool: `src/mcp/tools.ts` and `src/schema/mcp.ts`.
