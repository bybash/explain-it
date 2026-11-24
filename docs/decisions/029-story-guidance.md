# 029: Storytelling guidance

## Context

The authoring guide (4.2) taught an agent to write good beats: one idea
each, show before you tell, end on the outcome. It said nothing about the
story as a whole: who the video is for, what the viewer should remember,
how it opens. An agent given a graph narrated it in node order, a tour of
a diagram rather than a story. Slice 4.5 adds that to the guide, before
the LLM drafts scripts in the app (5.4) and reuses the same text.

## Decision

- **A "Shaping the story" section** in the guide, before the beat rules:
  the audience, the one thing to remember, the shape, the hook and the
  length.
- **Four shapes**, kept as data in `src/schema/story.ts` (`STORY_SHAPES`):
  problem, how it works, outcome (the default); before and after (for a
  change); the happy path, then what goes wrong; the whole system, then
  one part. Each says what its beats do and what it suits. The guide lists
  them from the data, and 3.14's brief will name one by its id.
- **The hook and the length are numbers** in the same file: a first line
  under 5 seconds, and 45 to 90 seconds in all. The guide states them,
  and 2.8's story checks can test them later without restating them.
- **A new approval step.** The agent agrees the story with the user after
  the graph and before writing any beat. Changing the story is cheap then
  and costly after the voice and the render.
- **The worked example names its shape** ("problem"), so the agent sees
  one applied.

## Alternatives

- **Free advice with no list of shapes.** Shorter, but an agent and the
  user then have no shared words for the story, and the brief (3.14) and
  checks (2.8) would have nothing to refer to.
- **More shapes** (a timeline, a comparison of two options). Four cover
  the flows explAIn-it draws; more can be added as data.
