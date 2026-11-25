# 038: Checks in the chat

## Context

Slice 5.8 (ROADMAP). The checks listed problems in the Preview gate's
Checks tab, in the words of a test report ("needs 19.2 characters a second
to read"), and left the user to find what to change. The feedback after 5.7
asked for a chat that fixes things, without boring people with checks.

## Decision

- **A fix is data**: what it changes, before and after (`src/schema/fixes.ts`).
  There are two kinds. *Words*: a beat's caption or line, shortened. *Layout*:
  the hand-placed positions, with the ones in a layout problem dropped so
  those nodes are laid out again.
- **Undo applies the inverse**, before and after swapped. Applying, or
  undoing, is refused with nothing changed when what it changes is no longer
  as it was, as the user or the assistant changed it since. New words are
  saved as the Script gate saves them, so they must fit the script.
- **The chat keeps it all.** A `checks` message offers fixes by id; a `fix`
  message says one was applied or undone, so whether it is applied is read
  from `chat.jsonl`. `POST /api/projects/:slug/fixes/:id` applies one, and
  `…/undo` undoes it.
- **Who proposes what.** The LLM proposes the shorter words, one structured
  call per problem; without a key a problem has no fix, only a link to its
  beat. The code works out layout fixes, which are applied as they are
  found and said, with Undo.
- **Only new problems are posted.** The quick checks run after each script
  change; the full checks when the Preview gate opens and before a render. A
  message is posted only for problems the chat has not reported yet; one
  that goes away is dropped quietly, and "all clear" is never posted.

## Alternatives

- **A slower pace as a fix for a caption read too fast.** Measured on the
  examples, it never helps: a step caption already holds its beat as long
  as reading it takes, and a narration caption goes at the voice's speed.
  Only fewer words fix it.
- **Keeping each file before and after, to undo by.** Larger, and an undo
  would overwrite every change made since; the inverse changes only what
  the fix changed.
- **Offering every fix, layout too.** Calmer, but more clicks for fixes that
  are almost always right, and each can be undone.
