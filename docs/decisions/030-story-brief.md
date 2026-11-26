# 030: The story brief and house rules

## Context

Slice 4.5 taught an agent to agree the story before the beats: who the
video is for, the one thing to remember, the shape, the hook. Slice 3.14
keeps that story with the project, lets the user add notes and rules for
one project, and house rules for every project, and gives them to MCP
agents (and later to the in-app LLM, 5.4). The ROADMAP left three
questions open: where the brief lives, where the house rules live, and
how rules are written.

## Decision

- **The brief is its own file, `brief.json`,** set with a new MCP tool,
  `set_brief`, and from the Script gate. `set_storyboard` replaces the
  whole storyboard, so a brief inside it would be lost by any agent that
  left it out, and the brief is written before any beat exists. The brief
  is replaced whole, like the storyboard. It does not move the gate.
- **Every field is optional:** `audience`, `takeaway`, `shape` (an id from
  `STORY_SHAPES`), `hook` and `notes`. A user can keep only notes, and a
  project needs no brief at all. Limits are in the zod schema.
- **Notes and rules are free text.** Fixed switches (tone, jargon, length)
  could be checked, but they guess what users want to say. 2.8's checks
  test the shape of a script, not the rules.
- **House rules are `house-rules.md` in the projects folder,** edited in
  Settings or by hand. Markdown is easy to write and to share with a team;
  `.env` holds the LLM settings and the key, and is a poor home for lines
  of prose. The file is read on every use, so an edit by hand counts at
  once.
- **Agents get them unasked.** The guide (`get_guide` and the
  `explain_flow` prompt) puts the house rules first, above the advice they
  override, and leaves the guide unchanged when there are none.
  `get_project` returns the brief and the house rules.

## Alternatives

- **The brief in `storyboard.json`.** One file fewer, but lost on a
  rewrite, and impossible before the beats.
- **House rules in `.env`, or per project only.** See above; rules for one
  project fit the brief's `notes`.
- **The house rules as a fixed part of the guide's tool descriptions.**
  Descriptions are read once when a client connects, so an edit would not
  reach an agent until it reconnected.
