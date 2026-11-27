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
   **3.9**, **4.5** (storytelling guidance, so MCP agents tell better
   stories straight away) with **3.14** (the story brief and rules), and
   **3.6** (the script gate's editor): the rest of the web app. 3.6 closes
   the path by hand, so a video can be made in the app without an LLM
   (decision 031). 3.12 moved to **Later**.
5. **Milestone 5**, the assistant: **5.1**, then **5.7** (the chat agent,
   built first so the chat works as soon as there is a client), **5.2**,
   **5.8** (checks in the chat), then **5.3**, **5.4** with
   **2.8** (story checks, which the agent runs on its own drafts), **5.5**
   and **5.6**. Then **Milestone 6**, with **3.15** (the Colours tab) and
   **3.16** (framing: the scene number, the title card's length and the
   camera) before 6.2, so the new examples can use them.
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
| ✅ 2.8 | **Story checks**: pure checks on the script's shape: the first beat is narrated and short (the hook), the last shows the outcome, the video's length is within a target, and no narrated beat does more than one thing. The assistant runs them on its own drafts and repairs what they find before the user sees the script (5.4); the Script gate's editor shows them as hints beside each beat, and `check` reports them. Judgement calls (jargon, tone) stay with the LLM | A broken fixture is caught; the example passes |

## Milestone 3: web app

| ID | Slice | Done when |
|---|---|---|
| ✅ 3.1 | **Server and shell**: Hono, the projects API over folders, SSE, `127.0.0.1` by default, a Vite and React shell listing projects, `npm run dev` and `npm start` | Projects can be created, listed and opened |
| ✅ 3.2 | **Settings**: base URL, key and model read from and written to `.env`; keys are never logged or sent to the browser in full | Settings round-trip; the key is masked in the UI |
| ✅ 3.3 | **Chat and gates**: the chat column, the gate stepper, the split layout, `chat.jsonl`; no LLM yet (a stub reply) | Messages persist across restarts |
| ✅ 3.4 | **Mermaid round-trip**: Mermaid to graph (jsdom, pinned version) and graph to Mermaid, keeping kind, icon and category by id | Round-trip tests on all examples and a set of Mermaid fixtures |
| ✅ 3.5 | **Graph gate panel**: a Mermaid editor with the rendered diagram, approve and edit | Editing the Mermaid updates `graph.json` |
| ✅ 3.6 | **Script gate panel**: the scene and beat editor, a form (captions, narration, actions picked from the scene's nodes and edges), with a starter script made from the graph, live hints beside each beat (its length, and a caption or line that reads too fast), and stale beats after graph edits | Changing a node marks only its beats as stale |
| ✅ 3.7 | **Style gate panel, the look**: palette and mode, font, title and end cards, logo upload, output, with a live preview drawn by the render player | Changes show in the preview straight away |
| ✅ 3.8 | **Preview gate**: the player with its sound (the voice generated with progress, mixed as the render mixes it), play and pause, a scrubber and the beat list | The example can be previewed with voice |
| ✅ 3.9 | **Render gate**: the job queue, progress over SSE, cancel, downloads | The example renders from the UI |
| ✅ 3.11 | **Style gate panel, the sound**: voice picker with a sample, voice speed, pacing, captions, music | A voice sample plays from the panel |
| ✅ 3.13 | **Preview gate checks**: run the checks from the panel, warnings that jump to their beat, the contact sheet | A warning in the example jumps to its beat |
| ✅ 3.10 | **App styles in Tailwind**: Tailwind v4 through its Vite plugin; the colour tokens and the dark set become `@theme` values; `app.css` moves to utility classes, keeping plain CSS only for CodeMirror's and Mermaid's own classes; the video's styles (`src/engine/`) are untouched; a decision record | Screenshots of each page, light and dark, look the same before and after |
| ✅ 3.22 | **Model picker**: the model picked from a list, grouped by family (Claude, Gemini, GPT, others), on the Settings page and above the chat's message box; one setting, `LLM_MODEL`; "Another model…" to type any id | A model picked in the chat shows in Settings, and a typed one in the chat (browser test) |
| ✅ 3.20 | **Titles bottom left**: `captions.place` puts the scene title and a two-line step caption in the bottom-left corner, above the narration, the scene framed in the whole height; the beat list rises from there; in the Captions card | Stills at the bottom, with the wide angle and the list; oauth-login and checkout check clean at the bottom with the wide angle |
| ✅ 3.19 | **Beat list**: `captions.list` lists the step captions down a column on the left, the current one solid and the ones before it faded, the content to its right; in the Captions card; measured and read by the checks | A still of the list; the plan's lines and their fade tested; oauth-login checks clean with it on |
| ✅ 3.18 | **Angle**: an `angle` in `config.json` (isometric, wide or high) and in the Look tab; the projection seen from an elevation, isometric unchanged to the pixel | Wide and high stills of the example; isometric stills byte-identical to before |
| ✅ 3.17 | **Badges and arrowheads**: a badge is a tag with pointed ends and a grey fill, apart from the edge label pills; an edge that arrives from behind its target stops just outside the box's outline, so its arrowhead is in sight | Stills show tags apart from pills, and arrowheads in sight on edges from behind |
| ✅ 3.16 | **Framing**: no scene number when there is only one scene; a shorter title card (20 characters a second, 3 to 5 s) with a "How long" setting (`cards.title.seconds`, 2 to 10 s); a camera for each scene (`config.camera`, zoom 1 to 2, moved up to half the frame), set with sliders and Reset in the Look tab, and by agents with `set_style` | A one-scene video shows no number; a set title card holds as set; a zoomed and moved scene shows in the preview and the render, and stills without a camera are unchanged |
| ✅ 3.15 | **Colours tab**: a Colours tab in the Style gate, a palette category for each node, edge and area with the default marked, "every node of this kind", saved to `graph.json` alone (`PUT /api/projects/:slug/colours`); a change of colour marks no beat stale; `get_project` and the chat's graph edits see what each category looks like, so "make it green" finds its category | A colour picked in the tab shows in the preview and is saved, with no beat stale; a recorded edit turns "make the identity provider pink" into its category |
| ✅ 3.14 | **Story brief and rules**: an optional brief for the script (the audience, the one takeaway, the shape of the story from 4.5's list, the hook), the project's own notes and rules (what to stress, what to leave out), and house rules in Settings that every project follows (for example "no jargon", "end with the docs link"); all in the zod schemas with their limits, in `brief.json` (set with `set_brief` and the Script gate) and `house-rules.md`, and given to MCP agents in `get_project` and the `explain_flow` prompt | A brief and a house rule set in the app reach an agent through the prompt and `get_project` |

3.14's open questions (where the brief and the house rules live, and how
rules are written) are settled in decision 030.

## Milestone 4: MCP

The goal: make a video end to end from an IDE, with no LLM in explAIn-it.

| ID | Slice | Done when |
|---|---|---|
| ✅ 4.1 | **MCP endpoint and project tools**: `/mcp` over Streamable HTTP with the MCP TypeScript SDK; `list_projects`, `get_project`, `create_project`, `update_graph`, `set_storyboard`, `set_style` (with the cards, and the logo as a file path or data URL copied into `assets/`); `origin` and `sources` on the project; a preview link in every result | Tests call each tool through an in-memory MCP client; invalid input returns readable errors |
| ✅ 4.2 | **Guidance and the `explain_flow` prompt**: authoring guidance in `src/guidance/` (schemas, limits, node kinds, actions, beats, approval steps), served as an MCP prompt and in the tool descriptions | The prompt lists correctly in an MCP client; the guidance is one source the LLM slices can reuse |
| ✅ 4.3 | **Check and render tools**: `check` (voice, checks, contact sheet returned as an image), `render`, `render_status` | A test project goes from `create_project` to an MP4 through tools alone |
| ✅ 4.4 | **IDE setup**: README configuration for Claude Code, Cursor and VS Code; a walkthrough explaining a feature of this repository | A video of an explAIn-it feature made from Claude Code, attached to the PR |
| ✅ 4.5 | **Storytelling guidance**: how to shape the whole story, not only a beat, in `src/guidance/`: who it is for, the one takeaway, a hook in the first few seconds, and a few story shapes to pick from (problem, how it works, outcome; before and after; the happy path, then what goes wrong; the whole system, then one part). The agent agrees the story with the user before writing the beats; served in `get_guide` and the `explain_flow` prompt, and reused by 5.4 | The prompt shows the shapes and the brief step; the example's script follows one shape |

## Milestone 5: the assistant

The goal: the chat on the left does the work for the user, from the first
message to the render, with their own key (decision 031). The in-app LLM
is an agent with the same tools MCP agents have, so the app, the IDE and
the path by hand stay one process. Without a key, the chat says so and the
user works by hand or over MCP.

| ID | Slice | Done when |
|---|---|---|
| ✅ 5.1 | **LLM client**: AI SDK with OpenRouter, Anthropic's own API (a Claude key) and OpenAI-compatible providers, structured calls, the repair loop, fixture recording and replay | Tests replay fixtures without a key |
| ✅ 5.2 | **Context**: pasted text and file upload, the 100k-character limit, storing files in `context/` | Oversized context is refused with a clear message |
| ✅ 5.3 | **Graph drafting**, through the chat agent (5.7): chat and context to `graph.json`, shown in the Mermaid view once saved, at most two questions | Fixtures: three described flows give valid graphs |
| ✅ 5.4 | **Script drafting**, through the chat agent (5.7): the story brief first (3.14), for approval, keeping to the project's and the house rules; then graph to scenes and beats, and a suggested title card, validated by the schema, the quick checks and 2.8's story checks, and repaired before the user sees it | Fixtures: the three graphs give valid storyboards |
| ✅ 5.5 | **Edits through chat**: JSON Patches for the graph and the storyboard | Fixtures: "rename X", "add a retry step", "shorten beat 3" |
| ✅ 5.6 | **Layout repair**: check failures the layout engine cannot fix go back to the LLM | A crowded fixture is fixed |
| ✅ 5.7 | **Chat agent**: the in-app LLM calls the same tools as MCP agents, in-process (the graph, the brief, the storyboard, the style, the checks, the render), following the guide with the house rules; it works gate by gate and waits for the user's approval in the chat; the panel follows each change; without a key, the chat points at the panel and Settings | Fixtures: a described flow goes from the first message to an approved graph and script through tools alone |
| ✅ 5.8 | **Checks in the chat**: the quick checks after every script change, the full checks when the Preview gate opens and when a render is asked for; the assistant reports them in plain words, each with a Fix. A fix that changes the user's words is offered first; a layout fix is applied and said. Every fix can be undone | Fixtures: a beat that reads too fast is fixed with one click, then undone |

## Milestone 6: ship

| ID | Slice | Done when |
|---|---|---|
| ✅ 6.1 | **Docker**: a slim image with Chromium and ffmpeg, volumes for projects and cache, a GHCR publish workflow on tags | `docker run` works on a clean machine |
| ✅ 6.2 | **Examples**: `ci-pipeline` and `checkout`, approved and rendered | All three examples render without a key |
| ✅ 6.3 | **Golden stills in CI**: stills of each example compared against stored images | CI fails on a visual regression |
| ✅ 6.4 | **Docs**: README with a demo video, `docs/ARCHITECTURE.md`, final `CONTRIBUTING.md`, tested models list | A new contributor can run the app from the README alone |
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

## Feedback (2026-11-24)

From using the app after 5.7, in the user's words where possible. Built
as three pull requests (decision 037) and one fix (decision 035).

**The video**

- ✅ Scene 2 of a video went semi-transparent: `dim` only ever faded out.
  Fixed: a dim is now its beat's focus (decision 035).

**The Graph gate**

- ✅ The Mermaid text and the drawn graph are one view with a toggle icon
  button, and the diagram opens full screen, with zoom.
- ✅ "Approve and go to …" is at the top right, at every gate.
- ✅ The assistant's graph shows in the viewer, not as text in its reply.

**The chat**

- ✅ Replies show as Markdown. Writing stays plain text: a rich editor
  (Milkdown) was weighed and left out (decision 037).
- ✅ Chat, Split or Panel: the chat alone on the page, beside the gate's
  panel, or the panel alone.
- ✅ Replies are short: the panel shows the files, so the assistant does not
  paste the graph or the script.

## Feedback (2026-11-26)

From watching a one-scene video (a small neural network) in the Preview
gate, in the user's words where possible. The first three are slice 3.16
(decision 044); the angle and the beat list are not placed yet.

**The video**

- ✅ When there is only one scene, the scene label needs no number: "How
  neurons form a network", not "1 · How neurons form a network".
- ✅ The title card stays on screen too long. Make it a little shorter, or let
  the user set how long it stays (a card setting in the Style gate).
- ✅ A camera the user can set: zoom in a little and move the graph left,
  right, up and down, so a graph fills the frame. In the neuron video the
  beat's title sits at the top left and the graph leaves space to the right
  and at the top; zoomed and moved, the graph could be larger.
- ✅ Another angle as an option: "about 60°" could fit a 16:9 frame better
  than isometric and leave room to zoom in. Slice 3.18: wide draws the floor
  as from 25° above it (60° from the vertical is 30°), which fits a 16:9
  frame better when the frame's height is what limits a layout; high is
  there for tall layouts (decision 047).
- ✅ Or keep the angle and use the empty left side for the beat titles, listed
  from top to bottom: the current beat's title solid, the ones before it
  semi-dimmed. Slice 3.19 (decision 048).

## Feedback (2026-11-27)

From watching the examples rendered in 6.2.

- ✅ A badge looked like an edge's label: badges are tags now (3.17).
- ✅ Arrowheads were hidden behind the boxes they point at (3.17).
- ✅ Badges and zone labels did not fade with a dim: fixed in #87 (decision
  042), which the 6.2 videos had not yet included.

## Feedback (2026-11-27, later)

- ✅ With the wide angle, the titles at the top hold the scene down from a
  bigger zoom, and a step caption cannot break onto a second line: titles
  can go in the bottom-left corner, two lines for the step caption; at the
  top the step band takes two lines when a caption needs them; the camera
  zooms to 3× (3.20).
- ✅ The beat list as an option: there since 3.19, and it rises from the
  bottom-left corner when the titles are there (3.20).
- ✅ A model selection for the chat, with Claude, Gemini, GPT and other
  models (3.22).

### Not placed yet, from 3.22

- The list is written by hand from OpenRouter's catalogue (2026-11-27), so a
  model it names can be retired; nothing checks it. Listing the endpoint's
  own models (OpenRouter's `/models`) would keep it current, at the cost of a
  call and a very long list.
- The model is one setting for the whole app, not per project or per chat.
- The chat's picker cuts a long note at a narrow column's edge.
- The chat reads the model when it opens, so a change in Settings in another
  tab shows there only once the chat opens again.

## Carried over

Work a finished slice left for a later one. Each list is removed by the slice
that finishes it.

### Not placed yet, from 2.5

- The layout engine now keeps routes in sight of boxes and places edge
  labels and badges clear of boxes and of each other; the example passes
  its checks. What it cannot fix stays a warning in `checks.json`, which
  5.6 sends to the LLM. On a crowded line a label may sit a few label
  heights off its line (the example's "save session").
- Not checked yet: the title and end cards, and edges against zone labels.

### Not placed yet, from 5.1, 5.3, 5.4 and 5.7

- Every step sends the whole guide as the system prompt; prompt caching
  (Claude's own API) would cut the cost of a long turn.
- A turn cannot be cancelled from the chat, and a message sent while the
  assistant is answering is refused (409).
- The assistant reads earlier turns as text only; a long conversation sends
  them all. A summary of older turns can come when it matters.
- `approve_gate` is guarded by its description and the system prompt
  only: the model is trusted to call it after the user approves. 5.8's
  checks can run when it is called.
- Recorded answers replay by a hash of everything asked
  (`src/llm/fixtures/`); a changed guide, tool or prompt needs
  `npm run llm:record` again (the scripted conversation is in
  `src/server/assistant-conversation.ts`).
- A personal Anthropic key that is not scoped to a workspace needs the
  `anthropic-workspace-id` header; the client does not send one.

### Not placed yet, from 5.2

- Once the assistant has read a context file, its text is sent again on
  every later step of that turn (and read again on the next turn, as earlier
  turns are kept as text only).
- A context file is UTF-8 text; a file in another encoding is refused in
  the chat rather than converted. PDFs and images are not context.
- Characters are counted as JavaScript counts them, so an emoji is two.

### Not placed yet, from 5.6 and 5.8

- A layout repair is offered once, from what the full checks found; it is
  not checked again in Chrome before it is offered (decision 040). The
  next checks say whether it worked, and a problem already reported is not
  said again, so a repair that falls short leaves it to the user.
- Loudness has no fix in the chat; the mix is made to the target, so a
  miss means a bug in `src/audio/`, not something to fix by hand.

### Not placed yet, from 5.8

- What the chat reported is kept in memory (`checksChat`), so a restart
  may report a problem once more. The checks that run before a render do
  not hold it: the render starts with them.
- The Preview gate's Checks tab still jumps to a warning in the player;
  its beat list has an Edit link to the beat in the Script gate.
- The story checks (2.8) reach the chat with the full checks (when the
  Preview gate opens), not after each script change, and have no fix.
- The Script gate's hints (`beatHints` in `src/web/script-model.ts`) and the
  chat's problems (`wordProblems`) read the same quick checks each their
  own way; a Fix in the editor beside a hint could share the chat's.

### For 6.5 (release), from 6.1 and 6.4

The release is prepared (version 0.1.0, `CHANGELOG.md`); what is left needs
a maintainer, and is listed as steps in [`docs/RELEASING.md`](docs/RELEASING.md):
the licence check of the image's GPL and LGPL parts, uploading the demo
video so the README plays it inline, the `v0.1.0` tag (which runs the
publish workflow for the first time), and making the GHCR package public.

### Not placed yet, from 3.20

- ✅ In the bottom-left corner (42% of the width), a step caption at the
  60-character limit in size L could need three lines and was cut at two:
  the player now wraps every step caption at the band's width, word by word
  in the video's font, and gives the band the lines the longest one needs
  (two at most at the top, three in the corner).
- With the titles at the bottom and the wide angle, the CI pipeline's area
  label leaves the frame by 12 px: the framing fits the area's outline, not
  its label, which lies outside it.
- ✅ Golden stills now cover the titles at the bottom (`bottom-` stills of oauth-login).

### Not placed yet, from 3.19

- With the beat list on, the scene is framed in less width: in the
  examples, checkout gets a 9 px badge overlap and the CI pipeline's
  camera, tuned for the full width, puts Staging out of the frame. The
  checks report both; the examples keep the list off.
- ✅ Golden stills now cover the beat list (`list-` stills of oauth-login); no test shows a list too long
  for its column: there the oldest lines leave from the top
  (`listFitter`), which was checked only by reading the code.
- The list shows the step captions, the only title a beat has; a separate,
  shorter beat title would read better in a narrow column.

### Not placed yet, from 3.18

- At the high angle, labels and badges keep their size while the drawing
  is stretched, so some meet: in the examples, an edge label over a zone's
  label (18 px) and a badge over a node (22 px). The checks report them.
- ✅ Golden stills now cover the wide and high angles (`wide-` and `high-` stills of oauth-login).

### Not placed yet, from 6.3

- ✅ The golden stills were light only; each scene's last beat is now kept
  in dark too.
- A still fails past about 500 changed pixels at 960 px: one arrowhead or
  a short label can change by less.
- The CI smoke test starts the image and checks that it answers, but does
  not render in it: that needs the voice model (about 300 MB) or a project
  with the voice off. The render test runs in the test stage, which shares
  the image's browser and ffmpeg.

### Not placed yet, from 3.16

- The Camera card has no browser test of its own (3.16 agreed the pure,
  schema and MCP seams, and stills by eye).
- ✅ The camera's sliders showed whole percents, so a camera set more
  finely over MCP showed rounded; they now go by a tenth of a percent.
- The layout repair's recording (5.6) holds only for some answers: three
  fresh recordings of the same prompt each left a zone label covered by
  about 12 px. Record it again only with `repair.test.ts` run after.

### Not placed yet, from 3.15

- The Colours tab has no browser test of its own (3.15 agreed the pure,
  API, MCP and recorded-LLM seams); it was checked by hand, with
  screenshots. The e2e flow could pick a colour and save it.

### Not placed yet, from 6.1

- The image is about 1.65 GB: Chromium and ffmpeg with their libraries
  are about 800 MB, and the runtime `node_modules` about 640 MB. Mermaid,
  CodeMirror and React (about 200 MB) are only bundled into the web app,
  but they are `dependencies`, which `npm ci --omit=dev` keeps; moving them
  to `devDependencies` needs the dependency-cruiser rule against dev
  dependencies in `src/` to allow the web app.
- A render in the container uses about 2.5 GB of memory (four Chrome
  pages, decision 010); Docker needs at least 4 GB.

### Found outside a slice

- ✅ `explain-it check` ended with "libc++abi: terminating … mutex lock
  failed" (exit code 134, not 1) when it found problems in a project whose
  voice it had just generated (6.2): `process.exit` tore the process down
  with the voice's ONNX threads still about. It now sets the exit code and
  lets Node exit. Its error paths (`fail`) now do the same: they set the
  exit code and end the command, and Node exits by itself.
- `serves a part of a video, so a player can seek` in
  `src/server/render-routes.test.ts` sometimes passes its 5-second timeout
  under load (twice so far: locally in 5.8, on CI in 6.1), and passes when
  run again.
- The starter script (`starterScript`) makes one scene of at most 12
  nodes and 10 beats; a larger graph keeps its other nodes and edges out
  of the starter, for the user, or the assistant, to add as scenes.
- The Script gate has no browser test of its own (3.6, 5.8 and 5.4 agreed
  other seams): the e2e flow could add its steps and a fix applied from the
  chat.
- Under an estimated voice, a narration caption goes at about the voice's
  pace whatever the line's length (4 words a second against 17 characters a
  second), so a line of long words reads too fast however short it is. The
  chat's shorter-words fix (5.8) asks for fewer characters; plainer words
  would help more.

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
- Streaming a draft into the Mermaid view as it is written (left out of 5.3,
  decision 039): the graph shows once it is saved.
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
- Style extras (was 3.12): a custom palette editor and font upload. A
  palette set over MCP shows as "Custom" but cannot be edited in the
  Style gate. `fontFor` (`src/engine/theme/fonts.ts`) knows only bundled
  fonts; an uploaded one needs the renderer, the checks and the preview to
  load it from `assets/`, and the checks' `filesKey`
  (`src/render/check-files.ts`) to hash the files the config names, so a
  replaced font or logo marks an older report out of date.
- Render speed (from 1.10, 2.4 and 3.9): a render captures every frame
  twice (captioned and clean), about twice the time; making the clean video
  optional, caching the music by mood, seed and length (1.4–2.8 s per
  75 s), and choosing the page count from the CPU count (`PAGES` in
  `src/render/render.ts`, 4 by default) would each help. One render at a
  time stays: one fills the machine (4 pages capture about 61 fps, 8 about
  68), and two at once each run at about half speed; overlapping renders
  still came out byte-identical to each rendered alone, so the queue is
  for speed and memory, not for determinism.
- Housekeeping (from 2.1, 3.7 and 3.9): old lines stay in `cache/tts/` when a
  line is edited; taking a logo out leaves its file in `assets/`; the Render gate cannot delete a render; renders made
  before 3.9 have no `render.json`, so the gate does not list them; and a
  cancel waits for a voice model download already under way. The gate
  re-reads every render on each progress event; with many renders, the
  event could carry the job and the disk list be read only when a job ends.
  Renders that failed or were cancelled stay listed until the app restarts.
