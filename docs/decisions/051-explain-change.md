# 051: Explaining a code change over MCP

## Context

Milestone 7 is about explaining a change where people already read, such as
a pull request. A coding agent already has the diff; what it lacks is a way
to tell the change as a short video, and something to post with it.

## Decision

- **A second MCP prompt, `explain_change`,** puts a short guide before the
  whole authoring guide (`src/guidance/change.ts`):
  - the graph holds only the parts the change touches, named as the code
    names them, with the changed files as `sources`;
  - the brief takes the `before-after` shape, for the people reviewing it;
  - the script has three scenes: Before, After, and What to review;
  - then check, render, and the summary.
- **A tool, `explain_change`,** returns a Markdown summary made from the
  script alone (`changeSummary` in `src/guidance/change-summary.ts`): the
  name, the takeaway, each scene's title and captions, and the files it
  covers. It says when they were not recorded, rather than nothing. So the
  summary always says what the video says.
- **The summary links the video only at an address the agent gives**
  (`video_url`, http or https), such as an attachment on the pull request.
  The tool also returns the newest render's video and poster paths on this
  machine, for the agent to attach. A local path is never linked: no one
  the summary is posted to could open it.
- **Posting is the user's call**: the prompt and the tool say to post only
  when the user says so.

## Alternatives

- **Wait for the GIF (7.2) and the card (7.4).** The summary and the video
  are useful now; the GIF and the card join the tool's result when they
  exist.
- **A tool that posts to GitHub itself.** That would need a token and change
  the local-only stance (Milestone 7's open question on sharing); the agent
  already has its own way to post.
- **Checking the video against the diff.** The "Trust" open question:
  `sources` is recorded, not checked, in this slice.
