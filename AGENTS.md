# AGENTS.md

Instructions for coding agents (Claude Code, Codex, Cursor and others) working
in this repository. Humans are welcome to read it too.

## What this project is

explAIn-it turns a described flow into an isometric explainer video. A user
chats, approves a graph (shown as Mermaid), approves a script, picks a style,
previews and renders. It runs locally, in TypeScript only, with the user's own
LLM key.

## Read first

1. [`SPEC.md`](SPEC.md): the source of truth for every design decision.
2. [`ROADMAP.md`](ROADMAP.md): the backlog, as numbered slices. One slice is
   one pull request.
3. [`CONTRIBUTING.md`](CONTRIBUTING.md): the review process.

If a task conflicts with `SPEC.md`, stop and say so. Do not silently diverge;
a design change is made by editing `SPEC.md` in the same pull request.

## Working on a slice

1. Pick the slice the user names, or the next one in the order `ROADMAP.md`
   gives (its **Order** section) that is not marked ✅.
2. Branch from an up-to-date `main`: `<id>-<short-name>`, for example
   `1.3-isometric-primitives`.
3. Do only that slice. Note anything else you find in the PR description
   instead of fixing it.
4. Meet the slice's **Done when** line, and show the evidence in the PR:
   test output, a screenshot, a still or a clip.
5. Mark the slice ✅ in `ROADMAP.md` in the same PR. List anything it leaves
   out under **Carried over** in `ROADMAP.md`, for the slice that should pick
   it up, and remove the carried-over items it finishes.
6. Open the PR with `.github/pull_request_template.md`. Title:
   `<type>(<scope>): <slice name> [<id>]`, for example
   `feat(engine): isometric primitives [1.3]`; it becomes the squash commit
   title. Do not merge it; a maintainer reviews and merges.

Never push to `main`, force-push a shared branch, or merge your own PR.

## Commands

Use Node 24 (`nvm use` reads `.nvmrc`). Run lint, typecheck, deps and test
before opening a PR; CI runs the same four.

```sh
npm install
npm run dev         # the app on http://127.0.0.1:3000 (PORT): Vite for the web app, the API on 3001 (DEV_API_PORT) behind it
npm run build       # build the web app into dist/web
npm start           # the built web app and the API in one process (run `npm run build` first)
npm run lint        # Biome: lint and format check (code and JSON, not Markdown)
npm run format      # Biome: apply fixes and formatting
npm run typecheck   # tsc --noEmit
npm run deps        # dependency-cruiser: module boundaries (.dependency-cruiser.cjs)
npm test            # Vitest
npm run schemas     # regenerate schemas/ after changing a zod schema
npm run layout -- examples/oauth-login   # recompute a project's layout.json
npm run music -- calm 30 calm.wav          # 30 s of a music mood (calm, upbeat, technical) as a WAV
npm run dev:engine  # the engine dev page in a browser
npm run screenshot -- "dev/iso.html?t=4" out.png   # a still of a dev page
npm run clip -- dev/iso.html out.mp4               # a clip of a dev page (needs ffmpeg)
npm run shots -- shots/before                      # every web app page, light and dark, as PNGs (needs Chrome); a name after the folder takes only the shots starting with it
npm run shots:compare -- shots/before shots/after shots/diff   # pixel differences between two sets of shots
npm run llm:record                                 # record the LLM fixtures in src/llm/fixtures/ with the model in .env (costs a few calls)
npm run build:engine                               # build the render page into dist/render
npx explain-it render examples/oauth-login         # render a project to out/ (needs Chrome and ffmpeg)
npx explain-it check examples/oauth-login          # all checks into checks.json, and contact-sheet.png (needs Chrome and ffmpeg)
```

After changing anything in `src/schema/`, run `npm run schemas` and commit
`schemas/`; a test fails when the files are out of date.

Source files import each other with the `.ts` extension
(`import { VERSION } from "./version.ts"`), so Node 24 can run them directly.
Use only TypeScript syntax that can be stripped: no `enum`, no `namespace`, no
parameter properties.

Keep this list current when you add a script.

## Architecture

**Functional core, imperative shell.**

- The **core** is pure functions over data: schemas, layout, timeline
  building, `seek(t)`, beat timing, checks, Mermaid conversion, patch
  application. No file, network, process, clock or randomness access.
- The **shell** does the input and output: project files, Playwright, ffmpeg,
  Kokoro, HTTP, MCP, the LLM. It calls the core; the core never calls it.

**Ports for the outside world.** Five interfaces, each with a fake for tests:
`TtsProvider`, `LlmClient`, `Renderer`, `ProjectStore`, `Clock`. Pass them in
as plain function or constructor parameters. No dependency-injection
container, no decorators. Do not add an interface until a second
implementation or a test fake needs one.

**Module boundaries** (see `SPEC.md`, Repository layout):

- `src/engine/` runs in the browser: no Node imports.
- `src/web/` never imports from `src/server/`; it talks to the API.
- Only `src/llm/` imports the AI SDK. Only `src/audio/` produces sound.
- Core modules never import shell modules.

These are checked in CI with dependency-cruiser from slice 1.1 on.

**One source of truth for every contract.** The zod schemas in `src/schema/`
are the only place a shape or limit is defined. Everything else is derived:
TypeScript types (`z.infer`), the JSON Schemas in `schemas/`, MCP tool input
schemas, LLM structured-output schemas, and the limits in the authoring
guidance (from `.describe()`, `.max()` and similar). Generated files are
checked in, and CI fails when they are out of date. Never restate a limit as
a literal somewhere else; import it.

## Code rules

- **TypeScript strict.** No `any` without a comment saying why.
- **Validate at the edges.** Every file read from disk, every API request,
  every MCP call and every LLM result goes through its zod schema.
- **Errors as values for expected failures.** Validation errors, check
  warnings and an LLM giving up return
  `{ ok: true, value } | { ok: false, errors }`. Throw only for bugs and
  broken environments (ffmpeg missing, disk full).
- **Errors name the exact place.** For example
  `scenes[1].beats[3].caption: 74 characters, max 60`. MCP agents and the
  LLM repair loop read these messages to fix their own output.
- **Rendering must be deterministic.** In `src/engine/`, the state at time `t`
  depends only on `t` and the project files. No `Date.now()`, no
  `Math.random()` (use the seeded generator), no `setInterval` or
  `requestAnimationFrame` loops that move things on their own.
- **Functions and data first.** Use a class only where state really lives
  (the render queue, a timeline instance). Treat core data as immutable:
  `readonly` types, never mutate inputs.
- **Named exports only.** No default exports (config files that a tool
  requires are the exception). No barrel `index.ts` files that re-export a
  folder; import from the file that defines the thing.
- **Small files, plain names.** One concept per file; past about 300 lines,
  consider splitting. Names over comments; a comment explains why, never what.
- **DRY for knowledge, rule of three for code.** A fact (a limit, a default,
  a list of kinds) lives in one place. Similar code may appear twice; extract
  it on the third time, once the shared shape is clear. Two plain copies beat
  one wrong abstraction.
- **No GSAP and no Python.** Animation uses our own timeline; audio is
  TypeScript.
- **Dependencies.** Prefer none. A new dependency needs a reason in the PR and
  a licence compatible with MIT (EPL-2.0 for elkjs is accepted). List it in
  the PR description.

## Tests

**Test first for logic.** For anything in the core, and for server and MCP
handlers, write a failing test, make it pass, then refactor. Reviewers may
ask which test drove a change. Showing red-then-green in the commits is
welcome but not required.

**Look first for visuals.** Isometric drawing, overlays and themes are judged
by eye: attach a screenshot or still to the PR. Once a look is approved, a
golden still guards it.

**Layers:**

1. **Unit** (Vitest): most of the suite, on pure functions, no mocks needed.
2. **Property-based** (`fast-check`) for invariants: seeking in any order
   gives the same state; layout never overlaps boxes; Mermaid → graph →
   Mermaid round-trips; applying a valid patch keeps the document valid.
3. **Integration:** the server API against a temporary projects folder; MCP
   through an in-memory client; a 2-second render with real Chromium and
   ffmpeg.
4. **Golden stills** of the examples, compared within a small tolerance.
5. **End to end:** a few Playwright tests of the web UI, one per gate.

Rules:

- Test behaviour through public functions, not internals.
- Use the fakes for ports; do not mock modules.
- **No live LLM calls in tests.** Use recorded fixtures in `src/llm/fixtures/`.
  CI has no API key.
- The examples in `examples/` are fixtures. If you change one, explain why.
- There is no coverage percentage gate. Reviewers judge whether the tests are
  meaningful.

**Decision records.** When a PR changes `SPEC.md` in a meaningful way, add a
short record in `docs/decisions/NNN-title.md`: context, decision, alternatives.
`SPEC.md` says what the system is; the records say why it became that.

## Secrets and data

- Never commit `.env`, API keys, `projects/`, `cache/` or rendered output.
- Never log an API key or send it to the browser in full.
- The server binds to `127.0.0.1` by default. Do not change that default.

## Writing

Docs and PR descriptions use plain, short sentences in British or American
English, consistently within a file. Explain what changed and why, then what
the reviewer should look at.
