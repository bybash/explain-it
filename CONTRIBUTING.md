# Contributing

Thanks for helping. explAIn-it is built in small pull requests that each do
one thing and leave `main` working.

## Before you start

- Read [`SPEC.md`](SPEC.md). It is the source of truth for the design.
- Find the slice in [`ROADMAP.md`](ROADMAP.md) you want to work on. For
  something not on the roadmap, open an issue first so we can agree on it.
- Coding agents: read [`AGENTS.md`](AGENTS.md).

## Set up

```sh
nvm use             # Node 24, from .nvmrc
npm install
npm run dev         # the app on http://127.0.0.1:3000, with hot reload
npm test
```

Google Chrome (or a Chromium at `CHROME_PATH`) and ffmpeg are needed to
render, and for the tests that render; without them, those tests skip
themselves. Docker is needed only for the golden stills (below). How the
code fits together is in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Making a change

1. Fork the repo (or branch, if you have access) from `main`.
2. Name the branch after the slice: `1.3-isometric-primitives`.
3. Keep to the slice. Note other problems in the PR description.
4. Run `npm run lint`, `npm run typecheck`, `npm run deps` and `npm test`.
5. Open a pull request and fill in the template. Show the result: test
   output, a screenshot, a still or a clip.
6. If the change alters the design, update `SPEC.md` in the same PR.

The PR title is a [Conventional Commits](https://www.conventionalcommits.org/)
title ending with the slice ID, for example
`feat(engine): isometric primitives [1.3]`. PRs are squash-merged, and the PR
title becomes the commit title on `main`.

## Two things a change may need

- **Golden stills.** A change to how the examples are drawn fails the
  golden stills in CI. Make them again with `npm run golden` (in Docker,
  for CI's browser and processor, so on an Arm Mac it runs emulated and
  takes several minutes), look at the difference in the PR, and say why it
  is right. `npm run golden:check` runs the check as CI does and writes any
  difference to `golden-out/`.
- **LLM recordings.** The tests replay recorded LLM answers from
  `src/llm/fixtures/` and never call an LLM. A change to a prompt, the
  authoring guide or a schema an LLM answers with changes what is asked, so
  the tests say which calls have no recording. A maintainer records them
  with `npm run llm:record`, which needs a key and costs a few dozen calls
  (a few cents with Haiku).

## Review

A maintainer checks the slice's **Done when** line in `ROADMAP.md`, the
architecture, code rules and test rules in `AGENTS.md`, and the evidence in
the PR. CI must pass: lint, typecheck, the module boundaries and the tests,
and, in the Docker image, the golden stills and every test of the renderer
and the checks (the ones that need Chromium or ffmpeg run there). The web
app's browser tests run in the first job, on the runner's Google Chrome. The branch must be up to date with `main`.

The short version of the engineering rules:

- **Test first for logic; look first for visuals.** Core logic and handlers
  are written test first. Visual work shows a screenshot or still; the
  examples' golden stills then guard it.
- **Functional core, imperative shell.** Pure functions inside; files,
  browsers, ffmpeg, TTS, HTTP, MCP and the LLM at the edges, behind small
  interfaces with test fakes.
- **One source of truth.** Shapes and limits are defined once, in the zod
  schemas, and everything else is derived from them.
- **DRY for knowledge, rule of three for code.** Facts live in one place;
  similar code is extracted on the third copy, not the second.
- **Errors as values** for expected failures, with messages that name the
  exact field.
- **Decision records** in `docs/decisions/` when the design changes.

## Licence

By contributing, you agree that your contribution is licensed under the
[MIT licence](LICENSE).
