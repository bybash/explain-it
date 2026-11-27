# explAIn-it: specification

explAIn-it turns a described flow into a short isometric explainer video with
captions, voice and music. You describe the flow in a chat (in your own words
or as a Mermaid flowchart), approve the graph, approve the script, pick a style,
watch a preview, and download the video.

It is open source (MIT), runs on your own machine (`npm` or Docker), and uses
your own LLM key. Nothing is hosted by the project.

There are two ways in, both writing the same project folders:

- **The web app**: a chat in the browser, using your LLM key.
- **MCP**: your IDE's agent (Claude Code, Cursor, VS Code and others) connects
  to the running app, reads your repository itself, and writes the graph and
  script through tools. No LLM key is needed in explAIn-it.

This document is the source of truth for v1. Decisions that change it are made
in a pull request that edits this file.

## Goals

- Any flow, not only software: a login, a CI pipeline, an order, a process.
- From description to a 1–3 minute video in under an hour, most of it review.
- No hand-placed timings or positions: narration sets timing, the engine lays out.
- Easy to clone and run: one language (TypeScript), no database, no Python.
- Deterministic rendering: the same project renders the same frames.
- Usable from the IDE: explain a feature of the repository you are working in.

## Non-goals for v1

- Hosting, accounts, login, telemetry.
- explAIn-it cloning or exploring a Git repository itself. The web app takes
  pasted or uploaded text; through MCP, the IDE's agent reads the repository.
- Images or whiteboard photos as input; Mermaid diagram types other than `flowchart`.
- Voices in languages other than English (captions can be any language).
- Flat 2D style, camera moves within a scene, 9:16 vertical, GIF output.
- Checking a video against source code. Sources are recorded (see Project)
  but not yet checked.

## User flow

The app is a chat on the left and a panel on the right, or either one alone:
a switch (Chat, Split, Panel) at the top of the project chooses, and the
browser keeps the choice. A narrow screen has no split. Messages show as
Markdown; HTML in them shows as text and images are never loaded (decision
037). Work moves through five **gates**. Each gate shows its result in the panel; the user approves it
by chat or by button, or edits it, either through chat or directly in the panel.

**Three ways through, one process** (decision 031). The gates, the files
and the checks are the same whoever does the work, and the ways can be
mixed on one project:

- **The chat.** With an LLM key in Settings, the assistant does the work:
  it calls the same tools as an MCP agent, gate by gate, and waits for the
  user's approval in the chat. From 5.8 it runs the checks itself and offers
  a fix for what they find (see LLM).
- **MCP.** An agent in the user's IDE, with their own LLM, calls the tools
  (see MCP).
- **By hand.** Without a key, the user does each gate in its panel: the
  Mermaid editor, the brief and the beat editor, the style form, the
  preview and the render; or writes the files and uses the CLI. The chat
  says that no LLM is connected and points at the panel and Settings.

| Gate | The LLM produces | The panel shows | Direct edits |
|---|---|---|---|
| 1. Graph | `graph.json` from the description and context | The diagram, or the Mermaid code behind it, switched by a button; the diagram full screen | Edit the Mermaid code |
| 2. Script | `brief.json`, the story, then `storyboard.json`: scenes and beats | The brief, then the scenes and beats as a form, each beat with its length and hints | Edit the brief; start a script from the graph; edit scenes, captions, narration, actions |
| 3. Style | Nothing (defaults are filled in) | Palette, font, voice, captions, music, output | The form |
| 4. Preview | Nothing (voice is generated here) | The player with a scrubber, beat list, check warnings and contact sheet | Jump to a beat and edit it |
| 5. Render | Nothing | Render progress, then downloads | Cancel, render again |

Rules:

- The LLM drafts right away and states its assumptions. It asks at most two
  questions, and only when it cannot draft anything sensible.
- The user can go back to any gate. Editing the graph marks only the beats
  that reference changed nodes or edges as stale; the script gate lists them.
  A beat references what its actions name (a dim action names the nodes it
  keeps); a scene's node list does not make its beats stale, and nor does a
  change of colour (a `category`), which no line depends on (decision 043).
  A stale beat stops being stale once it is rewritten.
- The Script gate's editor (decision 032) makes a starter script from the
  graph when there is none: one scene, a beat for each edge that shows its
  ends and sends its flow, captions from the labels, and no narration yet.
  Actions are picked from the scene's own nodes and edges. Beside each
  beat it shows its length and hints, worked out in the browser as the
  user types: from the reading-speed check, a line or caption that goes by
  too fast to read; from the story checks (2.8), a hook that is not said or
  too long, an ending on another step, and a beat that does more than one
  thing. Hints show while the script is valid. A line already spoken is
  timed by its voice, as the checks time it; any other by its words. The
  script saves only when it is valid, as `set_storyboard` saves it.
- The gates and the Approve button are across the top, and stay there as
  the panel scrolls. A graph saved by the assistant, or over MCP, shows
  at once unless the user has edits of their own, which are kept and the
  saved graph offered.
- Style can be changed at any later gate without going back.
- `project.json` keeps the furthest gate reached. Approving moves on from that
  gate only, so a second click or an old tab changes nothing; the graph and
  script gates need their file, valid. Going back to an earlier gate shows it
  (the address names it, `#/projects/<slug>/<gate>`) and keeps it approved.
- Chat messages are saved to `chat.jsonl`, each with the gate it was sent at.
  The assistant answers each message in the background, one at a time per
  project; the line for each change it makes (`kind: "step"`, such as
  "Saved the graph.") and its reply are added as they come, and the chat
  says while it is working. Without a key, its reply says so and points at
  the panel and Settings (decision 034). Gates are approved with their
  button, or by the assistant when the user approves in the chat.
- Checks warn and never block. The user can always render.

## Data model

All files are JSON, validated with zod. JSON Schemas are generated from the zod
schemas and published in `schemas/`.

### Graph (`graph.json`)

The source of truth for the structure. Mermaid is generated from it for
display and parsed back into it after a user edit; fields that Mermaid cannot
express (kind, icon, category) are kept by matching node and edge ids.

```ts
type Graph = {
  version: 1;
  title: string;
  nodes: GraphNode[];   // at most 36 in total
  edges: GraphEdge[];
  zones: Zone[];        // Mermaid subgraphs
};

type GraphNode = {
  id: string;           // [a-z][a-z0-9_]*, stable across edits; not a Mermaid keyword (end, graph, subgraph…)
  label: string;        // shown on the node top, ≤ 24 characters
  kind: NodeKind;
  icon?: string;        // a Lucide icon name, validated against the icon set
  zone?: string;        // a zone id
  category?: string;    // a palette category name; default by kind
};

type NodeKind =
  | "actor" | "service" | "database" | "queue"
  | "document" | "decision" | "external";
// The eighth kind from the design, "group", is a Zone.

type GraphEdge = { id: string; from: string; to: string; label?: string; category?: string };
// An edge id may be a Mermaid keyword except end, graph, flowchart, subgraph, style, class
// and default, which break an edge in the diagram.
type Zone = { id: string; label: string; category?: string };
```

Each kind has a default box size, height, category and icon. A zone is drawn
as a tinted platform under its nodes, its label laid flat on the floor along
the platform's front-left edge, just outside it, where its own boxes cannot
cover it. Categories are `accent`, `muted` and
`c1` to `c6`; a palette with fewer than six category colours repeats them in
order, and an unknown category draws in the accent colour. Edges and zones
without a category use the accent. An edge's arrowhead takes its edge's
colour. A colour is always a category, never a hex value, so it follows the
palette in light and dark; a colour of one's own goes in a custom palette
(decision 043).

### Storyboard (`storyboard.json`)

```ts
type Storyboard = {
  version: 1;
  scenes: Scene[];      // 1–3
};

type Scene = {
  id: string;
  title: string;        // e.g. "Login"; shown as "1 · Login", or "Login" when it is the only scene
  nodes: string[];      // the subset of graph nodes in this scene, ≤ 12
  beats: Beat[];        // 3–10
};

type Beat = {
  id: string;
  caption: string;      // the step caption, ≤ 60 characters
  say?: string;         // the narration line; without it the beat is timed by its actions and caption
  actions: Action[];
  notes?: string;       // the author's own notes; never shown
};

type Action =
  | { type: "appear"; node: string }
  | { type: "flow"; edge: string; label?: string }
  | { type: "highlight"; node: string }
  | { type: "callout"; node: string; title?: string; text: string }
  | { type: "dim"; except: string[] }
  | { type: "badge"; node: string; text: string; tone: "info" | "ok" | "warn" | "error" };
```

The camera is fixed within a scene and frames the scene's nodes. A scene's
camera in `config.json` zooms in (up to twice as close) and moves the scene
from where it fits, by a share of the area it is framed in (below the
titles and above the captions, up to half of it), so a scene
with room around it can fill the frame; the layout checks say whether it
still fits (decision 044). Scenes change with a short transition.

### Brief (`brief.json`)

The story the script tells, agreed before the beats are written (decision
030). Every field is optional; the file is replaced whole.

```ts
type Brief = {
  version: 1;
  audience?: string;  // who the video is for, ≤ 80 characters
  takeaway?: string;  // the one thing to remember, ≤ 140 characters
  shape?: "problem" | "before-after" | "failure" | "zoom";  // src/schema/story.ts
  hook?: string;      // what the first beat says, ≤ 140 characters
  notes?: string;     // this project's own notes and rules for the story, ≤ 2000 characters
};
```

**House rules** are the user's rules for every project's story, such as "no
jargon" or "end with a link to the docs": free text, at most 4000
characters, in `house-rules.md` in the projects folder. The Settings page
edits them, and they can be written or shared by hand. The guide puts them
first, above the advice they override, and `get_project` returns them.

### Config (`config.json`)

```ts
type Config = {
  theme: { palette: string | CustomPalette; mode: "light" | "dark" | "both" };
  font: string;                         // a bundled font id or an uploaded font file
  pacing: "relaxed" | "normal" | "brisk";                   // how unhurried the video is; "relaxed" by default
  voice: { enabled: boolean; id: string; speed: number };   // a kokoro voice, e.g. "af_heart"
  captions: { narration: boolean; step: boolean; list: boolean; size: "S" | "M" | "L" };
                                        // list: the step captions down the left side (off by default)
  music: { enabled: boolean; mood: "calm" | "upbeat" | "technical"; seed: number; volumeDb: number }; // volumeDb: under the voice, −12 by default
  output: { resolution: "1080p" | "720p" };
  cards?: {
    title?: { title: string; description?: string; seconds?: number }; // ≤ 100 and ≤ 160 characters, wrapped; seconds: 2–10
    end?: {
      headline: string;                 // ≤ 100 characters, wrapped
      link?: string;                    // an http(s) URL, ≤ 200 characters; also drawn as a QR code
      where?: string;                   // where to find the feature, ≤ 80 characters
      credit?: string;                  // who made the video, or the company, ≤ 80 characters
    };
  };
  logo?: {
    light?: string;                     // a file name in assets/ (no folders) ending in lower-case .png, .jpg, .jpeg or .svg, at most 2 MB;
    dark?: string;                      // at least one of the two; one serves both modes
    corner?: "top-right" | "bottom-right";              // default "top-right"
    show?: "start" | "end" | "both" | "all";            // the title card, the end card, both (default), or every frame;
                                                        // the title card closing the video counts as the end card
  };
  angle: "isometric" | "wide" | "high";  // the angle the scenes are seen from; "isometric" by default
  camera?: Record<string, { zoom: number; x: number; y: number }>;
                                        // by scene id: zoom 1–2, x and y −0.5–0.5 (right and down positive)
};

type CustomPalette = {
  background: string; surface: string; text: string; muted: string; accent: string;
  categories: string[];                 // up to 6 colours
  dark?: Omit<CustomPalette, "dark">;   // generated from the light palette when missing
};
```

### Project folder

```text
projects/<slug>/
  project.json        name, furthest gate reached, stale beat ids, timestamps
  chat.jsonl          the conversation, one message per line
  context/            uploaded text files
  graph.json
  layout.json         computed positions plus the user's manual overrides
  storyboard.json
  brief.json          the story brief
  config.json
  assets/             the logo, referred to from config.json
  cache/tts/          <hash of model + voice + speed + text>.wav (decision 012)
  out/<timestamp>/    rendered outputs
```

Projects are plain folders: they can be committed, diffed and shared. There is
no database.

### Project (`project.json`)

```ts
type Project = {
  version: 1;
  name: string;
  gate: "graph" | "script" | "style" | "preview" | "render";
  staleBeats: string[];
  origin: "web" | "mcp";
  sources?: { path: string; commit?: string }[];  // files the video explains, filled in over MCP
  createdAt: string;
  updatedAt: string;
};
```

`sources` is stored but not checked in v1. It allows a later check that lists
the files changed since the video was made.

## Engine

The engine runs in the browser. The same page is used for the live preview and
for frame capture, so what the user approves is what gets rendered.

- **Layout.** elkjs (`layered`, orthogonal edge routing, zones as compound
  nodes) computes positions in grid units; positions are snapped to the grid.
  Manual overrides in `layout.json` win. Layout runs on the server and is
  saved, so the page never lays out.
- **Isometric drawing.** One projection function maps grid positions to the
  screen. A node is three faces of a box with a flat top carrying the icon and
  label. The floor is a dotted grid. Elements are depth-sorted.
  The `angle` setting draws the scenes flatter or deeper than isometric
  (decision 047): wide draws the floor as it looks from 25° above it, so a
  layout fills a 16:9 frame with larger boxes; high as from 50°, for a tall
  layout. Box heights keep isometric's ratio to the floor, so a box hides
  as much of the floor as it does in isometric: wide and high are the
  isometric picture squashed or stretched vertically, not a new viewpoint.
- **Theme.** A palette (a preset or a custom palette) and a mode become CSS
  custom properties on the page; the stylesheet only refers to them. Presets
  carry a hand-picked dark variant; a custom palette without one gets a
  generated dark variant that keeps every hue and meets fixed contrast
  (text 7:1, muted text 4.5:1, accent and categories 3:1 on the background).
  Fonts are bundled as woff2 files and loaded before the scene is drawn, since
  labels are fitted by measuring them.
- **Edges.** The routed path is drawn on the floor. `flow` draws it in, then
  sends a dot along it; flowing dashes follow the timeline. The label sits on
  the longest visible segment, in a pill drawn above the nodes. An edge
  that arrives from behind its target box would end where the box hides its
  arrowhead, so it stops just outside the box's outline on screen (decision
  045). Layout
  straightens jogs shorter than a grid step that snapping leaves in a route.
  Where the layout dropped a route (an end was overridden), the engine draws
  a simple orthogonal one: straight between boxes that share enough of a
  side, otherwise with one bend.
- **Overlays.** HTML on top of the SVG: callout cards, badges, step caption,
  narration caption, scene title. Anchored to projected node positions. The
  stage is split into bands inside the safe area: the scene title at the top
  left, the step caption under it, the narration caption along the bottom (at
  most two lines), and the content between them, where the scene is framed.
  A caption that is turned off gives its band to the content. With the
  step captions listed (`captions.list`, decision 048), they run down a
  column on the left, a third of the width, under the scene title: each
  beat's caption appears as its beat starts and stays to the scene's end,
  solid while its beat is on and faded to 45% after, and the content moves
  to the right of the column. A callout card
  sits beside its node, to the right if that side is free, else the left,
  above or below, sliding along a side before covering a box or an edge
  label. A badge stands on its node's back corner: a tag with pointed ends,
  outlined in its tone over a grey from the palette, so a node's state never
  reads as an edge's label pill (decision 045). Badge tones keep fixed
  hues in every palette (info is the accent, ok green, warn amber, error
  red), lightened or darkened to the accent's contrast.
- **Cards.** An optional title card opens the video and an optional end
  card closes it, set in `config.json` (see Config). The title card shows
  the title in the middle with the description under it. The end card
  shows the headline, then the link with its QR code beside it, then where
  to find the feature and the credit. The QR code is dark on a light tile
  in both modes, encodes the link as UTF-8, and grows with the link so a
  module stays at least 4 px at 720p. Only the title and the headline are
  required; every other line, and the logo, can be left out. Text wraps, to
  at most three lines for a title, headline or description. Cards have no
  step or narration caption.
- **Logo.** Drawn as an `<img>` (an SVG runs no script that way), fitted
  inside 200×64 px at 1080p in the chosen corner of the safe area, keeping
  its aspect ratio. On scene frames (`show: "all"`), the band in that
  corner leaves room for it. Without an end card and a title card, the
  ending shows it in the middle, fitted inside 480×160 px.
- **Timeline.** Our own, not GSAP. Tweens with eases, staggers and labels;
  `seek(t)` sets the whole scene from `t` alone, so any frame can be rendered
  in any order. The page exposes `__seek(t)`, `__duration` and `__cues`.
- **Timing.**
  1. Each action type has a default duration, and actions always run at it:
     a pace or a short line never speeds an animation up.
  2. Narration and actions start 0.3 s into a beat. A beat lasts until the
     longer of them ends, plus the pace's pause, and at least the pace's
     shortest beat:

     | Pace | Pause after | Shortest beat |
     |---|---|---|
     | relaxed (default) | 1.0 s | 3 s |
     | normal | 0.6 s | 2 s |
     | brisk | 0.3 s | 1.5 s |

     A beat also lasts at least its step caption's reading time, 15
     characters per second, spoken or not (decision 017).
  3. Actions run in order at their default length, with the spare time
     shared out after each; callouts stay until the narration ends, and
     badges until the scene ends. A `dim` is its beat's focus: from its
     start, every node it does not keep, and each edge touching one, fades
     back, and what it keeps comes back, so a later dim moves the focus and
     a node both keep stays bright. A beat without a dim brings everything
     back as it starts; the last beat's focus holds through the scene's
     fade-out (decision 035). What belongs to a faded node fades with it:
     its label and icon, the badges and callouts on it, and its zone, name
     and all, once the focus keeps none of the zone's nodes (decision 042).
  4. Narration longer than the caption band's two lines is split into cues,
     between sentences, else clauses, else words; each cue is on screen for
     its share of the line's characters. The cues are `__cues` and the `.srt`.
  5. Each scene is drawn on its own layer, framed to its own nodes, and
     scenes crossfade; a scene of a few nodes is not zoomed past a fixed
     largest scale. A scene draws only the edges it flows; its nodes
     without an `appear` are there from its start, and a zone's platform
     rises with the first of its nodes to appear.
  Narration is first: a spoken line's length is measured from its audio
  once the voice exists (the MCP `check` tool, and every render, generate
  it); before that it is estimated at 2.5 words per second. With the voice
  off, a line is timed by reading it, at 15 characters per second; with the
  narration captions off as well, nothing carries it, and it does not time
  its beat. Decision 013 says why.
- **Opening and ending.** An end card holds for max(3 s, its text length ÷
  15 characters per second). A title card is read with nothing else on
  screen, so it holds for its text length ÷ 20 characters per second, 3 to
  5 s, or as long as its `seconds` (decision 044). The title card is on screen from the first frame,
  and fades out over the scene transition (0.8 s) as the first scene fades
  in. The video ends the same way: the last scene fades out over the scene
  transition as the closing card fades in, and the card holds to the last
  frame. The closing card is the end card, or else the title card again,
  or else the logo in the middle. With none of them, the last scene fades
  to the empty background, which holds for 1.2 s.

## Audio

- **Voice.** A `TtsProvider` interface; v1 ships `kokoro-js` (Kokoro-82M ONNX,
  q8, about 92 MB, English voices). The model downloads on first use into
  the app's cache directory, `cache/models/` (`CACHE_DIR`, `./cache` by
  default); the 28 voices ship with kokoro-js, and `config.voice.id` must
  be one of them. Lines are 16-bit mono WAV at 24 kHz, keyed by model,
  kokoro-js version, voice, speed and text, so editing one line
  regenerates only that line. They are generated by the MCP `check` tool,
  by every render while the voice is on, and, from the Preview gate (3.8),
  when a project enters it. A render cannot go on without its voice: when
  the voice fails, turning it off renders without it. Decisions 012 and
  013 say why.
- **Music.** Procedural, ported from the prototype's numpy code: three moods,
  each seeded, so a project always gets the same music. calm is a warm pad
  with sparse plucks (about 60 bpm); upbeat a brighter major with a bouncy
  arpeggio and a soft pulse on the beat (100 bpm); technical a cool modal
  sequence of short glassy notes over a drone (110 bpm). The seed picks the
  chord the progression starts on and the arpeggio pattern (12 note
  sequences a mood), and every note's phase and small changes in loudness.
  Music is made at 48 kHz for the video's length with the prototype's
  lowpass and echo, fades in over 3 s and out over 5 s (shorter on short
  music), and every mood sits at −22 dBFS RMS with peaks under −1 dBFS;
  `music.volumeDb` is applied in the mix. `npm run music` writes a sample.
  Decision 014 says why.
- **Mix.** Each voice line starts at its beat's narration start, and the
  voice is levelled to −18 dBFS RMS while it speaks. The music sits
  `music.volumeDb` (−12 by default) under the voice while nobody speaks,
  and dips 6 dB further while the voice speaks: it starts to dip about
  0.17 s before a line and is fully down 0.05 s before it (the prototype's
  envelope). Without a voice the music is the whole mix, so `volumeDb` has
  no effect. Kokoro's 24 kHz lines are resampled to 48 kHz by windowed sinc.
  The mix
  is normalised to −16 LUFS integrated with a true peak at or below −1 dBTP
  (its spikes limited, then ffmpeg's loudnorm in two passes), written as
  `audio.wav` (16-bit, 48 kHz),
  and muxed into both videos as AAC at 192 kbps. With neither voice nor
  music the videos are silent and there is no `audio.wav`. Decision 015
  says why.

## Checks

Checks run on the server against the preview page before rendering, and write
a JSON report, `checks.json` in the project's folder, that the Preview gate
shows as warnings linked to beats. `explain-it check` and the MCP `check`
tool run them, timed by the voice. The page seeks each beat's midpoint and
reports what it draws (`__shapes()`): every node's box, every zone's platform
and label, every edge as drawn so far, and every overlay (scene title,
captions, callouts, badges, edge labels, the logo). The overlap check counts
two nodes, a node on a zone it is not in, a zone's label under a node or an
overlay, an edge through a node it does not connect, an overlay on a node
(but not a callout or badge on its own node), and two overlays. An edge
under a box counts as running through it: the box hides that stretch of
floor. The title and end cards are laid out on their own and are not
checked. Reading speed and narration fit come from the beat plan the video
plays; loudness from the soundtrack a render would make, mixed into a
scratch file and measured. A loudness warning is about the whole video, so
it names no beat. With narration-first timing a line always fits the beat
built from it, so narration fit guards that rule. Title cards, end cards
and scene titles hold their text long enough by design and are not
reading-checked. A check that cannot run (no Chrome for the layout, no
ffmpeg for loudness, no voice for narration fit and loudness) is listed in
the report as skipped, with the reason; the others still run. `explain-it check` exits 1 when it finds problems (the story
checks are advice, and do not count) and 2 when it cannot check. Layout warnings do not stop a render; the layout engine keeps
routes in sight of boxes and places edge labels and badges clear of boxes and
of each other. Decision 016 says why.

The Preview gate runs the same checks from a button. They wait for the
preview's sound (see Audio), so narration fit is timed by its voice and
loudness measures its soundtrack, `cache/preview/<key>.wav`, which is
mixed as a render mixes it, instead of mixing another. When the voice
failed, narration fit and loudness are skipped; when only the mix failed,
loudness is skipped with the mix's own words. Running them asks for the
sound again, so a sound that failed is tried once more. Each step (waiting,
each beat checked, done) is told over the event stream and its progress
("beat 4 of 10") read from the API; a newer run stops the older and starts
once it has ended. A file edited while the checks wait for the sound makes
them wait for the sound of the new files. The report keeps a key of the
files it checked (`filesKey`: the graph, the script, the layout and the
style), so the gate shows an older report marked as out of date rather
than hiding it. Decision 027 says why.

| Check | Measured | Warns when |
|---|---|---|
| Overlap | Projected node-top polygons and overlay boxes, at each beat's midpoint | Two elements overlap by more than 4 px (they would have to move more than 4 px apart; an edge runs more than 4 px inside a box) |
| Off frame | The same shapes | Anything leaves the 1920×1080 safe area (5% margin) |
| Reading speed | Caption characters ÷ seconds on screen | Above 15 characters per second for a step caption, or 17 for a narration caption (a subtitle of speech also heard) |
| Narration fit | Voice length against the room its beat leaves it, from the lead-in to the beat's end | A line would need speeding up by more than 1.05× |
| Loudness | ffmpeg `ebur128` on the final mix, made by the check as a render would | Outside −16 ± 1 LUFS or true peak above −1 dBTP |
| Hook (story) | The first beat, timed as it plays | It has no narration, or takes more than 5 s |
| Outcome (story) | The last beat's actions | It flows another edge, rather than showing where the flow ends |
| One thing (story) | Each narrated beat | More than two flows, or more than two sentences |
| Length (story) | The whole video | Outside 45 to 90 s |

The story checks (2.8) are pure, on the script and its plan: the Script
gate shows them as hints, `check` reports them, and the assistant's
`draft_script` repairs its own script against them. Judgement calls
(jargon, tone) stay with the LLM.

Layout problems go back to the layout engine first and to the LLM second.

The **contact sheet** is one still per beat on a single image: each beat at
its midpoint, four to a row, labelled with its number, scene, beat and time,
and outlined in red with a count when the checks found warnings there. Chrome
lays it out from a page, so the labels need no font tools. `check` writes
`contact-sheet.png` beside `checks.json`, and a small JPEG (up to 1280 px wide)
that the MCP tool returns as an image; every render writes one per theme.
Decision 018 says why.

## Rendering

- Playwright drives headless Chromium. The page is captured frame by frame at
  30 fps by seeking the timeline. 4 pages, each in a browser of its own,
  capture interleaved frames in parallel; they are put back in order and
  piped to one ffmpeg, so the video is identical to a one-page capture.
  Chromium rasterizes in full and in software, so a frame's pixels depend
  only on its time (decision 010).
- The page is built with Vite into `dist/render/` and served on `127.0.0.1`
  with the bundled fonts. The renderer puts the project's files on
  `window.__project` before the page loads; the page validates them again,
  draws them and exposes `__seek`, `__duration` and `__cues`. The dev page
  and the render page share one player, so what is previewed is what is
  rendered.
- ffmpeg encodes H.264 and AAC. Frames are piped to it as PNGs; 720p is
  captured at 1080p and scaled down.
- The poster is the title card when there is one. Otherwise it is the
  frame in the middle of the first scene's last beat, when that scene is
  fully drawn. Outputs go in `out/<timestamp>/<theme>/`.
- One render job runs at a time, in an in-process queue, with progress over
  SSE and a cancel button: each change to a job is an event, and the page
  reads the job, with its folder in `out/`, from the API. A job names its step: the voice, line by line;
  the mix; each theme's frames, by the hundredth; then its files. When the
  Preview gate has mixed the same soundtrack (`cache/preview/<key>.wav`, its
  key a hash of what the sound follows), the render copies it instead of
  mixing again.
- A finished render writes `out/<timestamp>/render.json` last: when it
  started, its resolution, its themes and the video's length. The Render
  gate lists every folder that has one, newest first, so renders made
  before a restart, or by MCP or the CLI, are listed too; a folder without
  one is a render still running, or one stopped part way. The gate serves
  a finished render's files, in byte ranges so its player can seek, and as
  downloads (decision 028).
- Outputs per theme (light, dark or both):
  - `video.mp4`: with captions and audio
  - `video-clean.mp4`: no burned-in narration captions (the step captions
    stay), with audio. It is captured in the same pass, a second screenshot
    of each frame with the narration hidden, so capture takes about twice
    as long; with narration captions off it is a copy of `video.mp4`.
  - `captions.srt`
  - `audio.wav`, when the video has voice or music
  - `poster.png`
  - `contact-sheet.png`

## LLM

- **The assistant is an agent.** The in-app LLM calls the same tools as an
  MCP agent, in-process, on the chat's own project, reads the same guide with
  the house rules, and stops for the user's approval at each gate. It has
  one tool MCP agents do not, `approve_gate`, which its instructions allow
  only when the user approved that gate in their last message (the model is
  trusted to follow them; the server checks only that the gate is the one
  reached and its file is valid). It reads the
  conversation as text (not its earlier tool calls), and the project through
  `get_project`. Its tool results leave out links and times, so a recorded
  conversation replays exactly. A turn stops at `MAX_AGENT_STEPS` steps (16). It has every MCP project
  tool but `create_project`, `list_projects` and `get_guide`, which a chat on
  one project has no use for.
- **Drafting tools.** Drafting a gate's file is one of the assistant's
  tools, which only the app has (an IDE's agent drafts itself): one
  structured call with the repair loop, its prompt in `src/llm/prompts/` as
  Markdown, built from the authoring guide's part on that file and the house
  rules, never written again. `draft_graph` (5.3) drafts graph.json from the
  user's description and the context files the assistant names, with what
  it assumed and at most two questions, and saves it as `update_graph`
  does. `draft_script` (5.4) drafts storyboard.json for the graph once a
  brief is agreed, following it and the house rules; the story checks and
  the quick checks send its answer back for repair, and when the repairs run
  out the last script that fits the graph is kept, with what is left, for
  the assistant to say. It suggests a title card. A change the user asks
  for in the chat ("rename X", "add a retry step", "shorten beat 3") goes
  to `edit_graph` or `edit_script` (5.5): one structured call that answers
  with a JSON Patch on the current file, applied and checked as the file
  is, so everything it does not touch stays as it was. Nothing is streamed: the graph
  shows in the Graph gate once it is saved (decision 039).
- **Checks become fixes.** The quick checks run after every script change,
  and the full checks when the Preview gate opens and before a render. The
  assistant reports what they find in plain words, each with a Fix, and
  only problems it has not reported yet. A fix that changes the user's
  words (a shorter caption or line, which the LLM proposes) is offered
  first; a layout fix (a box put by hand laid out again) is applied and
  said. A layout problem that does not cover goes to the LLM (5.6), which
  may shorten labels or move nodes to another scene, never a box by
  coordinates; its repair is offered, as it changes the user's words, and
  the next checks say whether it worked (decision 040). Every fix can be undone, unless what it changed has changed since
  (decision 038).
  The assistant runs the checks on its own drafts and repairs them before
  showing them, so most problems never reach the user.
- Vercel AI SDK. Providers: OpenRouter (default), Anthropic's own API for a
  Claude key (native structured output), and any OpenAI-compatible
  endpoint (OpenAI, Ollama, LM Studio). Settings: base URL, API key, model.
  The OpenRouter and Anthropic presets suggest a model their API knows
  (`claude-opus-5-5` for Anthropic); for OpenAI and local endpoints the
  user names the model. A key echoed in an endpoint's error is never
  repeated.
  One model for every call in v1.
- Drafting is one of the assistant's tools: one structured call per file,
  each with its own zod schema:
  - **Graph:** the chat and context in, `graph.json` out. Streamed, so the
    Mermaid view builds up live.
  - **Script:** the approved graph in, `storyboard.json` out.
  - **Edit:** a chat message and the current JSON in, a JSON Patch out, so the
    model cannot silently drop parts it was not asked to change.
- Every result is validated (schema, then references between graph and
  storyboard, then the checks that apply). Errors are sent back to the model,
  at most twice.
- The client makes two kinds of call: a structured call (JSON in a
  schema's shape) and an agent's step (the conversation so far and the tools
  on offer in, the model's text and the tools it calls out; the agent runs
  them). Both are recorded and replayed the same way.
- One client for every endpoint: the AI SDK's Anthropic provider for
  `api.anthropic.com`, its OpenAI-compatible provider for the rest, with the
  settings read on every call. A failed call names its cause so
  the user can act on it: a refused key, an unknown model or base URL, a
  host that cannot be reached, a missing key. An endpoint on this machine
  (Ollama, LM Studio) needs no key.
- Prompts live in `src/llm/prompts/` as Markdown files.
- Context: pasted text and uploaded `.md`, `.txt`, `.mmd` and source files
  (`CONTEXT_EXTENSIONS`), kept as text in the project's `context/`, up to
  100,000 characters in total (`MAX_CONTEXT_CHARS`). Above that nothing is
  kept, and the user is told by how much and asked to remove or trim a
  file; nothing is summarised silently. A binary file is refused. The
  assistant's prompt lists the files by name and size, and its
  `read_context` tool reads one when it needs it, so the text is not sent
  on every step (decision 036). Context is added from the chat: attach a
  file, or add what is typed in the message box as a file.
- The README lists models tested for structured output. Local models are best
  effort.

## MCP

The running app serves an MCP endpoint at `http://127.0.0.1:3000/mcp`
(Streamable HTTP), using the official MCP TypeScript SDK. It shares the
process, project folders, render queue and preview pages with the web app, and
works the same under Docker. The app must be running for the IDE to connect.

In MCP mode explAIn-it makes no LLM calls. The IDE's agent reads the user's
repository, writes the graph and storyboard, and calls the tools below. The
server validates, lays out, checks, previews and renders.

| Tool | Does | Returns |
|---|---|---|
| `get_guide` | Reads the authoring guide | The guide as text, with the house rules, the same as `explain_flow` |
| `list_projects` | Lists projects | Names, gates, last update |
| `get_project` | Reads one project | Its files, the current gate, the house rules, and what each colour category looks like in its palette (`colours`) |
| `create_project` | Creates a project from a graph, with optional `sources` | Validation errors or the Mermaid, and a preview link |
| `update_graph` | Replaces the graph or applies a JSON Patch | Errors or the Mermaid; stale beats |
| `set_brief` | Replaces the story brief | Errors or the brief, and a preview link |
| `set_storyboard` | Replaces the storyboard or applies a JSON Patch | Errors, timing (measured for lines already voiced, else estimated, with a count of each), check warnings |
| `set_style` | Updates `config.json` | The config, a preview link |
| `check` | Generates the voice if needed and runs the checks | The report (readiness, the voice, every check by beat, the timing) and the contact sheet as an image |
| `render` | Queues a render | A job id |
| `render_status` | Reads a render job | Progress, then the output paths |
| `cancel_render` | Cancels a queued or running render | The job; no partial files are left |

The endpoint is stateless: each POST gets a fresh MCP server on the shared
projects and answers with JSON; GET and DELETE answer 405. It sits behind
the same host and origin checks as the API. Tool arguments are checked by
the project's own schemas, so an error names its place
(`graph.nodes[2].kind: …`) the way the rest of the app does, and an error
about a project ends with its preview link. A JSON Patch is RFC 6902.
`set_style`'s settings merge like a JSON Merge Patch (RFC 7386): objects
merge, `null` removes, anything else replaces. A logo comes as an absolute
file path or a data URL and is checked like any logo before it is copied
into `assets/`; a logo named in the settings must already be there. Graph
changes are laid out again at once, keeping manual positions, and
`update_graph` also lists the storyboard lines the new graph breaks. A
broken `layout.json` or `config.json` that a tool replaces is reported as a
warning. Changes to one project are made one at a time. Gates only move
forward as files arrive (graph, then script, then style); approval happens
in the IDE's chat. Every change is announced over SSE, so an open preview
page follows along. Decision 011 says why.

**Guidance.** An MCP prompt, `explain_flow`, and the tool descriptions carry
what the agent needs to write good files: the schemas, the limits, the node
kinds and actions, how to shape the whole story (who it is for, the one
thing to remember, the hook, the length, and one of a few story shapes in
`src/schema/story.ts`), how to tell it in beats, and when to stop for the
user's approval. The in-app LLM prompts are built from the same guidance.
The guide is one text in `src/guidance/` (`authoringGuide()`): the file
formats are generated from the zod schemas as TypeScript-like types, with
every field, limit, default and description, and the other lists come
from the code, so it cannot drift from what the tools accept. The prompt takes an optional
`topic`. An agent cannot open a prompt by itself (an IDE offers it to the
user, as a slash command in Claude Code), so `get_guide` returns the same
text, and the graph and storyboard tools carry a short summary of their
format that points at it.

**In the app** the same guide has steps of its own (`authoringGuide({ where:
"app" })`): the panel beside the chat shows each file, so the assistant never
pastes the graph or the script; it says what it made and asks. Its tools leave
out the Mermaid too. Everything after the steps is the same text.

**Approval** over MCP. The prompt tells the agent to show the user the Mermaid, then
agree the story with them and save it with `set_brief`, then show the
script, in the IDE chat and to wait for approval before moving on. Every
tool result includes a link to the project in the web app for a visual
preview. The server never blocks a render on approval. MCP elicitation may
replace this once clients support it widely.

**Projects** created over MCP live in the server's `projects/` folder, like any
other. Exporting a project into the user's repository comes later.

**Setup.** The README gives a one-line configuration for Claude Code, Cursor
and VS Code, and a walkthrough. The repository carries `.mcp.json` (read by
Claude Code and VS Code) and `.cursor/mcp.json`, both pointing at the
default address. A stdio shim that starts the app when it is not running
comes later.

## Mermaid

- Input: `flowchart` (and `graph`) only. Subgraphs become zones.
- Parsing uses the full `mermaid` package (pinned version) with jsdom globals
  on the server, reading nodes, edges and subgraphs from the diagram's
  internal database. This is not a public Mermaid API, so it is wrapped in one
  module with round-trip tests. It runs in a worker thread of its own, so the
  browser globals Mermaid needs never reach the server's thread, where other
  libraries (transformers.js) would take them for a browser.
- Reading back: each node's kind comes from its shape (the shapes the
  generator writes); a node named without brackets keeps the kind it had; icons and categories, and the order of nodes, come from
  the graph before the edit, matched by id. An edge keeps the id the diagram
  names (`from id@--> to`); an edge without one takes the id of the previous
  edge between the same nodes, or `<from>_to_<to>`. The title comes from the
  diagram's front matter, else the graph before.
- What the graph cannot hold is kept as near as it can be and named in notes:
  styling (`style`, `classDef`, `class`, `:::`, `linkStyle`) and `click`
  lines, shapes with no kind (a service, or the node's kind before), line
  kinds other than a plain arrow, nested subgraphs (each its own zone). A
  diagram that is not a flowchart, or that Mermaid cannot read, is an error
  naming its line in the text as written (Mermaid counts without the front
  matter and `%%{init}%%` directives, so its count is mapped back); a graph the schema refuses names the node or edge
  (decision 021).
- The web UI renders Mermaid on the client.
- The graph gate's panel is the code, in CodeMirror, beside the diagram it
  draws. The code is read on the server as it is typed (after a short
  pause), so the notes on what the graph leaves out, and an error marked on
  its line, show before saving. Save keeps the code as written and writes
  `graph.json` the way MCP's
  `update_graph` does: the layout again, keeping manual positions, and the
  beats an edit touches marked stale. A project with no graph starts from a
  small diagram, and the gate cannot be approved while edits are unsaved
  (decision 022).
- The style gate's panel is a form beside a live preview. The preview is
  the render page's player, in an iframe of its own, drawing the unsaved
  form straight away, with a scrubber and buttons for the title card, each
  beat and the end. Save sends what changed as a JSON Merge Patch with any
  new logo files and writes `config.json` the way MCP's `set_style` does;
  the gate cannot be approved while changes are unsaved (decision 024).
  Its Look tab sets how long the title card holds (Auto, or 2 to 10 s), and
  has a Camera card: Zoom, Left or right and Up or down sliders for one
  scene at a time, with Reset (decision 044).
  Its Colours tab lists the nodes, edges and areas (zones), each with the
  palette's category swatches, the default marked; a node's row can give its
  colour to every node of its kind. Save writes only the categories in
  `graph.json`, with nothing laid out again and no beat stale (decision 043).
  Its sound has samples: the voice speaks the script's first line (a
  sentence of its own when there is no narration yet) in the chosen voice
  and speed, cached with the video's lines, and the music plays 15 s of the
  chosen mood and take at the chosen volume (decision 025).
- The preview gate's panel plays the video with its sound. Opening it
  speaks every line not cached yet, with progress ("line 4 of 10") over the
  event stream, then mixes the soundtrack as the render does, into
  `cache/preview/<key>.wav`, the key a hash of the voice model and the
  files the sound follows; a change to them makes it again, speaking only
  the lines that changed. Until it is ready the video plays silently with
  estimated timing; then the picture follows the soundtrack's clock, timed
  by the measured narration. Below the player, three tabs. Beats lists the
  beats by scene: the one playing is marked, a click goes to it, and a
  beat the checks warned about carries the count (decision 026). Checks
  runs the checks (see Checks) and lists their warnings, those about the
  whole video and the skipped checks first, then those at beats in the
  order they show; a click on one goes to where it shows, in the Beats
  tab. Contact sheet shows the sheet the checks drew. A report older than
  the files is shown, marked as out of date (decision 027).
- The render gate's panel renders the video with the style's theme and
  resolution, or others chosen there without changing the style. A render
  under way says its step ("Speaking line 4 of 10", "Capturing the light
  video: frame 812 of 1950") with a bar and Cancel; renders queue behind
  it. Each finished render plays each theme's video inline, its poster
  first, and lists every file with its size to download (decision 028).

## App and stack

- Node 24 LTS, TypeScript (strict), one npm package.
- Web: Vite and React, styled with Tailwind (decision 023). Server: Hono.
  Progress: Server-Sent Events.
- `npm run dev` for development. `npm start` runs one Node process that
  serves the built UI and the API.
- The server listens on `127.0.0.1:3000` by default. No login, no telemetry.
  `VOICE=tone` swaps Kokoro for a tone a word, with no model, for the
  browser test. `HOST` and `PORT` change where it listens (under `npm run dev`, `PORT` is
  Vite's dev server and `DEV_API_PORT`, 3001 by default, the API behind it), `PROJECTS_DIR` where the
  projects folder is (`./projects` by default), and `PUBLIC_URL` the
  address preview links use when the app sits behind a proxy, as it does
  under `npm run dev`. With no login, the API
  answers only its own pages: it refuses requests addressed to another host
  name (DNS rebinding) or sent from another site's page, takes request bodies
  only as JSON (which a cross-site form cannot send), and caps them at 1 MB,
  except a style edit, which may carry two logos (about 6 MB). Uploaded
  files are checked by type and size; a logo comes from the page as data,
  never as a path on the server.
- Keys: read from `.env`; the settings page writes to it. Docker users pass
  `-e OPENROUTER_API_KEY=…`. The variables are `LLM_BASE_URL` (OpenRouter by
  default), `LLM_MODEL` and `LLM_API_KEY`, with `OPENROUTER_API_KEY` read as
  the key when `LLM_API_KEY` is not set. Each setting is looked up in the
  environment first, then in `.env`, so a variable the environment sets wins
  (even `OPENROUTER_API_KEY` over an `LLM_API_KEY` in `.env`), and the page
  shows it but cannot change it. Only its owner
  can read the `.env` the page writes, and the page sees the key only as its
  last four characters. `ENV_FILE` moves the file (decision 019).
  The app has no TLS, so a key never travels over plain HTTP between
  machines: the page saves a key only when it is opened at a name of this
  machine (`localhost`, `127.0.0.1`, `[::1]`), and a base URL may use
  `http://` only for this machine or Docker's `host.docker.internal`. Any
  program on this machine can still call the API; with no login, that is
  accepted.
- Visuals: Lucide icons (ISC); about 8 bundled OFL fonts; about 6 palettes,
  each with light and dark variants.
- Layout: elkjs (EPL-2.0, used as a dependency).
- Tests: Vitest. LLM calls are recorded as fixtures and replayed in CI, so CI
  needs no API key. Each example's beats are drawn as stills (light, timed
  by the estimated voice, 960 px wide) and compared with the golden stills
  in `golden/` within a small tolerance; CI runs them, the render test and
  the layout repair inside the Docker image's test stage, where the golden
  stills are made, so the browser and fonts match (decision 046).
- Lint and format: Biome.

### CLI

```text
explain-it render <project> [--theme light|dark|both] [--resolution 720p]
explain-it check  <project>
```

Creating and editing projects happens in the web UI.

### Docker

A slim Node base (Debian) with Chromium and ffmpeg, for Intel and Arm
machines, published to GHCR from CI when a release is tagged (decision
041). The voice model is not in the image: it downloads into the cache
volume the first time a voice is generated.

```sh
docker run -p 127.0.0.1:3000:3000 \
  -v ./projects:/app/projects -v ./cache:/app/cache -v ./config:/app/config \
  -e OPENROUTER_API_KEY=... ghcr.io/bybash/explain-it
```

- Inside the container the app listens on every interface (`HOST=0.0.0.0`);
  publishing the port on `127.0.0.1` keeps it on this machine.
- A key saved in the settings page goes to `/app/config/.env`
  (`ENV_FILE`), its own volume, never beside the projects. A key passed
  with `-e` needs no file.
- It runs as the image's `node` user (uid 1000). On Linux, folders mounted
  from the host and owned by another user need `--user "$(id -u):$(id -g)"`.
- The image carries GPL and LGPL parts; `NOTICE.md`, copied into it, says
  which and where their source is.
- The CLI is in the image: `docker run … ghcr.io/bybash/explain-it
  explain-it render projects/<name>`.

Supported: macOS and Linux natively; Windows through Docker.

## Repository layout

```text
src/
  schema/      zod schemas for graph, storyboard, config, project
  layout/      elkjs layout, grid snapping, overrides
  engine/      iso, edges, overlays, timeline, theme (browser)
  audio/       tts providers, music, mix
  checks/      overlap, frame, reading speed, narration fit, loudness, contact sheet
  render/      capture, encode, outputs, job queue
  mermaid/     parse and generate
  guidance/    authoring guidance shared by the MCP prompt and the LLM prompts
  llm/         client, calls, repair loop, prompts/, fixtures
  mcp/         MCP endpoint and tools
  server/      Hono app, projects API, SSE, settings
  web/         React app: chat, gates, panels, player
  cli/         render and check
assets/        bundled fonts with their licences (palettes are in src/engine/theme; icons come from lucide)
examples/      oauth-login, ci-pipeline, checkout (approved projects)
golden/        the examples' golden stills, one per beat
schemas/       generated JSON Schemas
docs/          ARCHITECTURE.md and other docs
```

## Examples

Three approved example projects in `examples/`, which render without an API
key and also serve as test fixtures:

- **OAuth login**: browser, app, identity provider, token exchange.
- **CI pipeline**: push, lint, tests and build side by side, a gate with a
  failure branch back to the pipeline, then the registry and staging. Dark,
  with a camera on its second scene.
- **Checkout**: shopper, order service, stock held before the payment
  provider takes the money, confirmation email.

OAuth login uses the default look. The CI pipeline and checkout examples
each have their own palette and font, their own colours for some nodes,
edges and areas, title and end cards, a logo and a brief, so the three show
the range; they began as the assistant's recorded drafts, edited by hand.

## Milestones

1. **Engine.** The CLI renders a hand-written example to MP4, with no LLM and
   no voice.
2. **Audio and checks.** Voice, narration-first timing, music, mix, checks,
   contact sheet.
3. **Web app.** The five gates, Mermaid round-trip, editors, preview, render queue.
4. **MCP.** The endpoint, the tools and the `explain_flow` prompt: the first
   way to make a video end to end, from the IDE, with no LLM in explAIn-it.
5. **The assistant.** The in-app LLM as an agent with the MCP tools, checks
   in the chat with Fix and undo, graph and script drafting through it, edits
   through chat, layout repair.
6. **Ship.** Docker on GHCR, three examples, docs, v0.1.0.

The pull requests that make up each milestone are listed in [`ROADMAP.md`](ROADMAP.md).

## Licences

- explAIn-it is MIT. The videos people make are theirs.
- Dependencies: Mermaid (MIT) with jsdom (MIT) to parse it on the server,
  CodeMirror (MIT, the graph editor), Tailwind CSS (MIT, the app's styles),
  Playwright (Apache-2.0), Kokoro-82M and
  kokoro-js (Apache-2.0), transformers.js (Apache-2.0), onnxruntime-node
  (MIT), AI SDK (Apache-2.0), MCP TypeScript SDK (MIT),
  fast-json-patch (MIT),
  Lucide (ISC), elkjs (EPL-2.0), qrcode-generator (MIT, the end card's QR
  code; jsQR, Apache-2.0, checks it in tests),
  fonts (OFL), ffmpeg (LGPL/GPL, called as a separate program).
- Two parts the voice brings in are not permissive and run in the app's
  process: eSpeak NG (GPL-3.0-or-later), bundled in kokoro-js's
  `phonemizer`, and libvips (LGPL-3.0-or-later), in `sharp`. A build that
  includes them, such as the Docker image, must meet those licences.
  Decision 012 says why.
- No GSAP and no MusicGen.
