/**
 * The shapes a story can take (SPEC, MCP: Guidance): the guide offers
 * them to an agent, and a project's brief names the one it follows.
 */
export const STORY_SHAPES = [
  {
    id: "problem",
    label: "Problem, how it works, outcome",
    beats:
      "the first beat names the problem the flow solves, the middle beats walk through the flow, and the last shows what the user has at the end",
    suits: "most flows",
  },
  {
    id: "before-after",
    label: "Before and after",
    beats:
      "the first beats show how it worked before and what was wrong with it, then what changed, and the last shows what is better now",
    suits: "a change, a pull request or a migration",
  },
  {
    id: "failure",
    label: "The happy path, then what goes wrong",
    beats:
      "the first beats show the flow working, then where it can fail and how it recovers, and the last shows that the user is safe either way",
    suits: "retries, errors and edge cases",
  },
  {
    id: "zoom",
    label: "The whole system, then one part",
    beats:
      "the first scene shows the whole system at a glance, then a second scene looks closely at the one part the video is about",
    suits: "a part that only makes sense in its place",
  },
] as const;

export type StoryShape = (typeof STORY_SHAPES)[number]["id"];
export const STORY_SHAPE_IDS = STORY_SHAPES.map((s) => s.id) as [StoryShape, ...StoryShape[]];

/** How long the hook may take: the first beat makes the viewer want the rest within this. */
export const HOOK_SECONDS = 5;
/** How long a video is best kept, in seconds: long enough to explain, short enough to be watched. */
export const TARGET_SECONDS = { min: 45, max: 90 } as const;
