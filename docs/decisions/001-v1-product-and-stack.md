# 001: v1 product shape and stack

## Context

explAIn-it started as a hand-built isometric explainer video for one product
feature: an 800-line page with GSAP, hand-placed positions and timings, and a
Python script for voice and music. Making another video meant repeating the
hand-tuning. The aim became a tool anyone can run to explain any flow.

## Decision

- **Open source, self-hosted, bring your own key.** MIT; clone and run with
  `npm` or Docker; no hosting, accounts or telemetry.
- **Chat with approval gates:** Graph (shown as Mermaid) → Script → Style →
  Preview → Render. The user approves each, by chat or by editing directly.
- **A typed graph JSON is the source of truth**; Mermaid is a view of it. The
  LLM produces meaning (nodes, kinds, edges, beats), never positions; elkjs
  lays out.
- **Narration sets the timing:** voice is generated first, and beats last as
  long as their lines.
- **TypeScript only.** kokoro-js for voice behind an interface, procedural
  music ported from the prototype, Vite and React, Hono, Playwright, ffmpeg.
  No Python, no database: projects are folders.
- **Our own timeline instead of GSAP.** GSAP's licence prohibits use in
  no-code animation tools that compete with Webflow, and we need a pure
  `seek(t)` for deterministic, parallel capture anyway.
- **Vercel AI SDK, not LangChain or LangGraph.** The flow is a fixed sequence
  of gates with one structured call each; a few hundred lines of our own state
  machine are simpler than an agent framework.
- **v1 limits:** `flowchart` input only, about 12 nodes per scene, up to 3
  scenes, about 3 minutes, English voice, isometric only.

## Alternatives considered

- An internal pipeline with YAML storyboards written by hand or by a coding
  agent: replaced by a product anyone can use.
- AGPL: rejected for MIT, the widest option.
- GSAP, Motion or anime.js: rejected for a small timeline of our own.
- Python Kokoro for word-level timestamps: deferred; one runtime matters more.
- dagre for layout: rejected for elkjs, which routes edges orthogonally and
  handles groups.
- LangChain or LangGraph: deferred until there is a real multi-step agent
  loop, such as exploring a repository.
