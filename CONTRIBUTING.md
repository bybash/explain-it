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
4. Run `npm run lint`, `npm run typecheck` and `npm test`.
5. Open a pull request titled `[<id>] <Slice name>` and fill in the template.
   Show the result: test output, a screenshot, a still or a clip.
6. If the change alters the design, update `SPEC.md` in the same PR.

PRs are squash-merged. The squash commit title follows
[Conventional Commits](https://www.conventionalcommits.org/), for example
`feat(engine): isometric primitives`.

## Review

A maintainer checks the slice's **Done when** line in `ROADMAP.md`, the code
rules in `AGENTS.md`, and the evidence in the PR. CI (lint, typecheck, tests)
must pass.

## Licence

By contributing, you agree that your contribution is licensed under the
[MIT licence](LICENSE).
