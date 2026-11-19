# Contributing

Thanks for helping. explAIn-it is built in small pull requests that each do
one thing and leave `main` working.

## Before you start

- Read [`SPEC.md`](SPEC.md). It is the source of truth for the design.
- Find the slice in [`ROADMAP.md`](ROADMAP.md) you want to work on. For
  something not on the roadmap, open an issue first so we can agree on it.
- Coding agents: read [`AGENTS.md`](AGENTS.md).

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

## Review

A maintainer checks the slice's **Done when** line in `ROADMAP.md`, the
architecture, code rules and test rules in `AGENTS.md`, and the evidence in
the PR. CI (lint, typecheck, tests) must pass, and the branch must be up to
date with `main`.

The short version of the engineering rules:

- **Test first for logic; look first for visuals.** Core logic and handlers
  are written test first. Visual work shows a screenshot or still, and gets a
  golden still once approved.
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
