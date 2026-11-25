# 037: The project page

## Context

Feedback from using the app after 5.7 (ROADMAP): the page was crowded, the
assistant pasted Mermaid and whole scripts into a narrow column as raw
Markdown, its graph did not show in the viewer, and Approve was below the
fold.

## Decision

- **Chat, Split or Panel.** A switch shows the chat alone, both, or the
  gate's panel alone; the browser keeps the choice. Both stay mounted, so
  nothing typed in either is lost. A narrow screen has Chat and Panel only;
  asking for a gate from the chat alone shows its panel.
- **The gates and Approve across the top**, sticky, at every gate.
- **One graph view**: the diagram, fitted to its box, or the code behind it,
  with an icon button between them, and the diagram full screen in a modal
  dialog with zoom. A project with a graph opens on the diagram.
- **The assistant's graph shows at once.** An untouched starter is not an
  edit to protect. Real edits are kept, and the saved graph offered.
- **The guide has steps for each place it is read.** Over MCP the agent
  shows the Mermaid and the script in its own chat; in the app it never
  pastes them, as the panel shows them.
- **Markdown is rendered, not edited**: react-markdown 10.1.0 and remark-gfm
  4.0.1 (MIT). HTML is dropped and images are not loaded, as a reply may
  repeat what it read in a user's files.

## Alternatives

- **Milkdown for the message box.** A large dependency (ProseMirror), and it
  may reformat pasted code or specs before they are sent or added as context.
- **Chat and panel as two exclusive views.** Simpler, but the user could not
  watch the panel change while the assistant works.
- **A draggable split.** More to build, and to make work from a keyboard.
