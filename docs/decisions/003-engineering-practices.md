# 003: Engineering practices

## Context

The project will be built in many small pull requests, by people and coding
agents, and handed to contributors who were not part of the design. The
practices need to keep the code easy to change and the reviews quick.

## Decision

- **Test first for logic, look first for visuals.** Core logic and handlers
  are written test first. Visual work is reviewed by screenshot, then guarded
  by golden stills.
- **Functional core, imperative shell.** Pure functions for layout, timing,
  checks and conversions; input and output at the edges.
- **Five ports with fakes:** `TtsProvider`, `LlmClient`, `Renderer`,
  `ProjectStore`, `Clock`, passed as parameters. No DI container.
- **One source of truth:** zod schemas define every shape and limit; types,
  JSON Schemas, MCP inputs, LLM output schemas and guidance are derived, and
  CI checks the generated files.
- **DRY for knowledge, rule of three for code.**
- **Errors as values** for expected failures, with messages naming the exact
  field, because agents and the repair loop read them.
- **Test layers:** unit, property-based (`fast-check`), integration, golden
  stills, a few end-to-end tests. No coverage percentage gate.
- **Style:** functions and data first, immutable core data, named exports, no
  barrel files, small files.
- **Boundaries enforced in CI** with dependency-cruiser.
- **Decision records** like this one when the design changes.

## Alternatives considered

- Strict DRY for code: rejected; early abstractions in a young codebase tend
  to be wrong and are costly to undo.
- TDD for everything, including visuals: rejected; pixel output is judged by
  eye first.
- A coverage threshold: rejected; it rewards tests that execute code without
  checking it.
- Enforcing boundaries in review only: rejected; agents and new contributors
  miss unwritten rules.
