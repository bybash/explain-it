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

1. Pick the slice the user names, or the first one in `ROADMAP.md` that is not
   marked ✅ and whose earlier slices are done.
2. Branch from an up-to-date `main`: `<id>-<short-name>`, for example
   `1.3-isometric-primitives`.
3. Do only that slice. Note anything else you find in the PR description
   instead of fixing it.
4. Meet the slice's **Done when** line, and show the evidence in the PR:
   test output, a screenshot, a still or a clip.
5. Mark the slice ✅ in `ROADMAP.md` in the same PR.
6. Open the PR with `.github/pull_request_template.md`. Title:
   `<type>(<scope>): <slice name> [<id>]`, for example
   `feat(engine): isometric primitives [1.3]`; it becomes the squash commit
   title. Do not merge it; a maintainer reviews and merges.

Never push to `main`, force-push a shared branch, or merge your own PR.

## Commands

Available from slice 0.2 on. Run all four before opening a PR.

```sh
npm install
npm run lint        # Biome
npm run typecheck   # tsc --noEmit
npm test            # Vitest
```

Later slices add `npm run dev`, `npm start` and the `explain-it` CLI. Keep this
list current when you add a script.

## Code rules

- **TypeScript strict.** No `any` without a comment saying why.
- **Validate at the edges.** Every file read from disk, every API request and
  every LLM result goes through its zod schema in `src/schema/`.
- **Respect the module boundaries** in `SPEC.md` (Repository layout):
  - `src/engine/` runs in the browser. No Node imports.
  - `src/web/` never imports from `src/server/`; it talks to the API.
  - Only `src/llm/` talks to an LLM. Only `src/audio/` produces sound.
- **Rendering must be deterministic.** In `src/engine/`, the state at time `t`
  depends only on `t` and the project files. No `Date.now()`, no
  `Math.random()` (use the seeded generator), no `setInterval` or
  `requestAnimationFrame` loops that move things on their own.
- **No GSAP and no Python.** Animation uses our own timeline; audio is
  TypeScript.
- **Dependencies.** Prefer none. A new dependency needs a reason in the PR and
  a licence compatible with MIT (EPL-2.0 for elkjs is accepted). List it in
  the PR description.
- **Small files, plain names.** One concept per module. Comments explain why,
  not what.

## Tests

- Write tests with the code (Vitest). Engine logic gets unit tests; visible
  output gets a screenshot or still in the PR.
- **No live LLM calls in tests.** Use recorded fixtures in `src/llm/fixtures/`.
  CI has no API key.
- The examples in `examples/` are fixtures. If you change one, explain why.

## Secrets and data

- Never commit `.env`, API keys, `projects/`, `cache/` or rendered output.
- Never log an API key or send it to the browser in full.
- The server binds to `127.0.0.1` by default. Do not change that default.

## Writing

Docs and PR descriptions use plain, short sentences in British or American
English, consistently within a file. Explain what changed and why, then what
the reviewer should look at.
