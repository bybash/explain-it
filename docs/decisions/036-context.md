# 036: Context for the assistant

## Context

Slice 5.2 lets the user give the assistant material to draft from: notes,
a spec, a Mermaid diagram, source code. The SPEC says pasted text and
uploaded `.md`, `.txt`, `.mmd` and source files, up to about 100,000
characters, stored in `context/`, with oversized context refused and
nothing summarised silently. Since 5.7, the assistant is an agent that takes
many steps a turn.

## Decision

- **Files in `context/`, text only.** Each is saved under a safe, unique
  name ("Login spec.md" becomes `login-spec.md`; a second `pasted.md` is
  `pasted-2.md`). Only known text kinds (`CONTEXT_EXTENSIONS`) are taken; a
  file that looks binary is refused.
- **Only plain files of those kinds count.** A folder, a link or a system's
  own file in `context/` is passed over; a file put there by hand is used.
  A file is reached only by a name in the list, so never outside `context/`.
- **A hard limit of 100,000 characters across the files.** A file that
  would go over it is not kept, and the error says the new total, how far
  over it is, and to remove or trim a file. The API answers 413. Adding
  holds the project lock, so files added at once are counted together.
- **The prompt lists, a tool reads.** The assistant's system prompt names
  each file with its size; `read_context` reads one. Sending all the text
  on every step of a turn would multiply its cost by the steps, about 15.
  With no context, the prompt says nothing of it, so recorded
  conversations without context are unchanged by its contents.
- **Added from the chat.** A paperclip attaches files; "Add as context"
  saves what is in the message box as a file. The files show as chips by
  the box, each with a button to remove it.

## Alternatives

- **All the text in the prompt.** The model always sees everything, at the
  most cost and the slowest steps.
- **A Context section in a gate's panel.** Visible, but away from the
  conversation the context is for.
- **PDFs and images.** A dependency and a model that can see; images as
  input are on the Later list.
