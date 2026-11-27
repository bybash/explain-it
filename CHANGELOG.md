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
- **Explain a code change**: the `explain_change` prompt and tool. The
  agent, which has the diff, makes a video of before, after and what to
  review, and gets a summary to post on the pull request, with the GIF and
  a TL;DR card. The summary is plain text, made from the script, and names
  the files it covers.
- **Pick the model** from a list (Claude, Gemini, GPT and others) in
  Settings or above the chat, or type any id.
- **From the terminal**: `explain-it render` and `explain-it check`.

### The video

- An isometric engine: boxes for actors, services, databases, queues and
  more, with Lucide icons; zones; routed edges with flowing dashes, a
  travelling dot and an arrowhead; callouts, badges and dims; title and end
  cards with a QR code; your logo.
- Narration with Kokoro, generated on your machine; music in three seeded
  moods; one mix at −16 LUFS; captions in the video and as `.srt`.
- Six palettes in light and dark, eight fonts, your own colours for nodes,
  edges and areas, and a camera for each scene, up to three times as close.
- Three angles (isometric, wide and high); the scene title and the step
  caption at the top or in the bottom-left corner, where a long caption
  takes the lines it needs; and an optional list of the beats.
- 1080p or 720p H.264, captioned and clean, with a poster; four browsers
  capture in parallel, and the same project always gives the same video.
- For sharing: one scene as a GIF (at most 15 s, captions burned in, aiming
  under 5 MB), which plays inline in a pull request or a chat, and a TL;DR
  card (1200 × 630): a headline, up to three points and a still, from
  `card.json` or the script.

### Checking it

- Checks for overlaps, anything off the frame, reading speed, narration
  fit, loudness and the story (a hook, the outcome, one thing per beat),
  with a contact sheet. In the app they are said in the chat, with fixes to
  apply and undo.

### Running it

- `npm` (Node 24) or Docker: one image with Chromium and ffmpeg, for Intel
  and Arm, published to `ghcr.io/bybash/explain-it`.
- Golden stills of the examples, in every angle and layout, guard the look
  in CI.
- Three examples: OAuth login, a CI pipeline and checkout.
