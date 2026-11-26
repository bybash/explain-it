# 031: Three ways through one process, and the assistant

## Context

A video can be made over MCP by an agent in the IDE, and the web app has
every gate's panel but the Script gate's editor. The checks warn, and in
the app the user had no way to act on most warnings. The SPEC planned the
in-app LLM as one structured call per gate. Writing a script without an
LLM or an agent was impossible in the app.

The aim is that making a video is easy for everyone: people with an
agent in their IDE, people who give the app their key, and people with no
LLM at all.

## Decision

- **One process, three ways through it:** the chat (the in-app LLM with
  the user's key), MCP (their own agent and LLM), and by hand (the gates'
  panels, or the files and the CLI). Every way writes the same files,
  passes the same gates and runs the same checks, and they can be mixed.
- **The path by hand is closed first.** 3.6, the Script gate's beat
  editor, comes now, with a starter script made from the graph, so a
  video can be made in the app without an LLM.
- **The in-app LLM is an agent with the MCP tools** (5.7), called
  in-process, rather than a fixed call per gate. The app and the IDE then
  do the same things, and every fix helps both.
- **Checks become fixes in the chat** (5.8). A warning comes with a Fix.
  A fix that changes the user's words is offered first; a timing or layout
  fix is applied and said. Every fix can be undone. The assistant checks
  and repairs its own drafts before showing them, so 2.8's story checks
  are its self-checks, and hints beside each beat in the editor.
- **3.12, the custom palette editor and font upload, moves to Later.**
  It is branding, and no one has asked for it.

## Alternatives

- **Warnings the user fixes by hand.** Without an editor most could not be
  fixed, and a list of problems is work, not help.
- **A separate in-app LLM pipeline.** Two ways of doing the same thing
  would drift apart; tools shared with MCP keep them one.
- **Applying every fix silently.** Quick, but it would change the user's
  words without asking.
