# Changelog

What each release adds, for people who use explAIn-it. The plan and the
reasons are in [`ROADMAP.md`](ROADMAP.md) and [`docs/decisions/`](docs/decisions/README.md).

## 0.1.0

The first release: a described flow becomes an isometric explainer video
with voice, music and captions, on your own machine.

### Making a video

- **The web app**, five gates beside a chat: Graph, Script, Style, Preview
  and Render. The assistant, with your own LLM key (OpenRouter, Anthropic or
  any OpenAI-compatible endpoint, local ones included), drafts the graph
  from your description and context files, agrees a story brief with you,
  drafts the script from it, and makes the edits you ask for. Every step can
  also be done by hand.
- **From your IDE**: an MCP server at `/mcp` with the same tools, a guide
  and the `explain_flow` prompt, so Claude Code, Cursor or VS Code can make
  a video from your repository.
- **From the terminal**: `explain-it render` and `explain-it check`.

### The video

- An isometric engine: boxes for actors, services, databases, queues and
  more, with Lucide icons; zones; routed edges with flowing dashes, a
  travelling dot and an arrowhead; callouts, badges and dims; title and end
  cards with a QR code; your logo.
- Narration with Kokoro, generated on your machine; music in three seeded
  moods; one mix at −16 LUFS; captions in the video and as `.srt`.
- Six palettes in light and dark, eight fonts, your own colours for nodes,
  edges and areas, and a camera for each scene.
- 1080p or 720p H.264, captioned and clean, with a poster; four browsers
  capture in parallel, and the same project always gives the same video.

### Checking it

- Checks for overlaps, anything off the frame, reading speed, narration
  fit, loudness and the story (a hook, the outcome, one thing per beat),
  with a contact sheet. In the app they are said in the chat, with fixes to
  apply and undo.

### Running it

- `npm` (Node 24) or Docker: one image with Chromium and ffmpeg, for Intel
  and Arm, published to `ghcr.io/bybash/explain-it`.
- Three examples: OAuth login, a CI pipeline and checkout.
