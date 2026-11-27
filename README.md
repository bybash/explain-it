# explAIn-it

Turn any flow into a short isometric explainer video, with captions, voice and
music.

Describe a flow in a chat, in your own words or as a Mermaid flowchart.
explAIn-it drafts the graph for you to approve, writes a script, lets you pick
a palette, font and voice, shows a live preview, and renders an MP4.

- **Any flow**: a login, a CI pipeline, an order, a business process.
- **Runs on your machine**: `npm` or Docker. Nothing is hosted.
- **Your own LLM key**: OpenRouter or any OpenAI-compatible endpoint,
  including local models.
- **Open source**: MIT. The videos you make are yours.

[![The checkout example playing: the shopper pays in the web app, which passes the order on](docs/screenshots/demo-checkout.gif)](https://github.com/bybash/explain-it/releases/download/v0.1.0/6.4-demo-checkout.mp4)

**[Watch the checkout example](https://github.com/bybash/explain-it/releases/download/v0.1.0/6.4-demo-checkout.mp4)** (64 s, with
voice and music), one of the three in [`examples/`](examples/), made from
the assistant's own draft.

## Try it

The quickest way is Docker. You need Docker with at least 4 GB of memory,
and an [OpenRouter](https://openrouter.ai) key for the chat (you can also
paste a key in the app's Settings later, or make a video by hand with none):

```sh
docker run -p 127.0.0.1:3000:3000 \
  -v ./projects:/app/projects -v ./cache:/app/cache -v ./config:/app/config \
  -e OPENROUTER_API_KEY=... ghcr.io/bybash/explain-it:0.1.1
```

Open <http://127.0.0.1:3000>, create a project and describe a flow in the
chat. The first time a voice is made, for the preview or a render, the
voice model downloads (about 100 MB), which takes a minute or two. More on Docker, `npm` and your IDE below.

Found a problem, or have an idea? [Open an issue](https://github.com/bybash/explain-it/issues/new/choose):
what you did, what you expected, and what happened. A screenshot, the
project folder or `checks.json` helps.

## Status

Released: v0.1.1. In the web app, a chat with your own LLM key
drafts the graph and the script with you; from your IDE, its agent can do
the same over MCP, and explain a code change as before, after and what to
review, with a GIF, a TL;DR card and a summary to post on the pull request.
Either way the result is an MP4 with voice, music and captions, in a light
or dark theme, made on your machine with `npm` or Docker. The design is in [`SPEC.md`](SPEC.md), how it is built in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), and the plan, one pull
request at a time, in [`ROADMAP.md`](ROADMAP.md).

## Requirements

- Node 24 (`nvm use` reads `.nvmrc`).
- Google Chrome, for rendering. Another Chromium works through `CHROME_PATH`.
- ffmpeg on your `PATH`, for rendering.
- About 100 MB of disk for the voice model (Kokoro-82M), which downloads
  into `cache/` the first time a project's voice is generated.
- For the app's chat: an LLM key, from OpenRouter, Anthropic or another
  provider, or a local model (see Models). Making a video by hand in the
  app, from your IDE's agent, or rendering the examples needs none.

## Start the app

```sh
git clone https://github.com/bybash/explain-it.git
cd explain-it
npm install
npm run build
npm start
```

The app runs on <http://127.0.0.1:3000>, and only there: it listens on
your own machine. Projects are kept in `projects/`. Keep it running while
your IDE uses it. `HOST`, `PORT`, `PROJECTS_DIR` and `CACHE_DIR` change these; with
another address, change the URL in your IDE's config to match.

Then:

1. Open **Settings**, choose your provider (OpenRouter is the default;
   Anthropic's API or any OpenAI-compatible endpoint, such as Ollama, also
   works), and paste its key. The key is saved to `.env`, which only you
   can read, and shown as its last four characters.
2. On the home page, name a **New project** and **Create** it, then
   describe the flow in the chat. The assistant drafts the graph; approve
   it, agree the story, approve the script, pick a style, preview it and
   render it.

To try an example first, copy one into your projects and open it:

```sh
cp -R examples/checkout projects/
```

Or render one straight from the terminal; the video goes to
`examples/checkout/out/`:

```sh
npx explain-it render examples/checkout
```

## Or run it with Docker

The image carries Node, Chromium and ffmpeg, so Docker is all you need
(on Windows, it is the way to run explAIn-it). It is published to GHCR for
Intel and Arm; it is about 1.65 GB, pulled once:

```sh
docker run -p 127.0.0.1:3000:3000 \
  -v ./projects:/app/projects -v ./cache:/app/cache -v ./config:/app/config \
  -e OPENROUTER_API_KEY=... ghcr.io/bybash/explain-it:0.1.1
```

Or build it from this repository: `docker build -t explain-it .`, then run
`explain-it` in place of the GHCR name.

Open <http://127.0.0.1:3000>. Give Docker at least 4 GB of memory: a render runs
four Chrome browsers. The voice model downloads into `cache/` the
first time; a key saved in Settings is kept in `config/.env`. On Linux, add
`--user "$(id -u):$(id -g)"` when the folders you mount belong to another
user than uid 1000. Render from the command line with
`docker run --rm -v ./projects:/app/projects -v ./cache:/app/cache ghcr.io/bybash/explain-it:0.1.1 explain-it render projects/<name>`.
To reach an LLM on your own machine (Ollama, LM Studio), use
`http://host.docker.internal:<port>` as its base URL (on Linux, also pass
`--add-host=host.docker.internal:host-gateway`).

## Models

The app's own LLM (Settings) can be OpenRouter, Anthropic's API with a
Claude key, or any OpenAI-compatible endpoint, including Ollama and LM
Studio. Pick the model from a list, in Settings or above the chat's message
box: Claude, Gemini, GPT and others on OpenRouter, each with a word on what
it suits, or type any model's id. Models tested for structured output:

| Model | Endpoint | Tested |
|---|---|---|
| `anthropic/claude-haiku-5.5` | OpenRouter | The recorded fixtures in `src/llm/fixtures/`: structured calls, graph and script drafting, edits, layout repair, shorter words, and a whole conversation with the assistant (5.1 to 6.2) |

The app suggests `anthropic/claude-sonnet-5.5` on OpenRouter when no model
is set; it has not been recorded, though a stronger model of the same
family is expected to do at least as well.

Other models should work if they answer with structured output (a JSON
Schema); they have not been recorded yet. To test one, set it in Settings
(or `LLM_MODEL` in `.env`), delete the fixtures, run `npm run llm:record`
(a few dozen calls; with Haiku, a few cents), and run `npm test`: the tests then replay that
model's answers. A model that cannot keep to the schemas shows up there,
as a call that ran out of repairs.

## Use it from your IDE

The app serves MCP at `http://127.0.0.1:3000/mcp`. Add it to your IDE once.

**Claude Code**, for every repository:

```sh
claude mcp add --transport http explain-it http://127.0.0.1:3000/mcp
```

**VS Code** (Copilot agent mode) and **Claude Code** read `.mcp.json` at the
root of a repository:

```json
{
  "mcpServers": {
    "explain-it": {
      "type": "http",
      "url": "http://127.0.0.1:3000/mcp"
    }
  }
}
```

**Cursor** reads `.cursor/mcp.json` in a repository, or `~/.cursor/mcp.json`
for every one:

```json
{
  "mcpServers": {
    "explain-it": {
      "url": "http://127.0.0.1:3000/mcp"
    }
  }
}
```

This repository carries both files, so opening it in any of the three
offers to connect explAIn-it. Your IDE asks before it trusts them. Older
versions of VS Code read `.vscode/mcp.json` instead, with `servers` in
place of `mcpServers`.

## Walkthrough: explain a feature of your repository

1. Start the app (`npm start`) and open your repository in your IDE, with
   explAIn-it connected.
2. Ask the agent for a video. For example:

   > Use explain-it to make a short video explaining how a request is
   > authenticated in this repository.

   In Claude Code you can also start from the `explain_flow` prompt: type
   `/mcp__explain-it__explain_flow` and give it the topic. To explain a
   code change, such as a pull request, use `/mcp__explain-it__explain_change`
   instead: the video shows before, after and what to review, and the agent
   gets a summary to post with it.
3. The agent reads the guide (`get_guide`), then your code, and drafts the
   flow as a graph with `create_project`. It shows you the graph as Mermaid
   and a link to the preview. Ask for changes, or approve it.
4. It writes the script, beat by beat, with `set_storyboard` and shows it
   to you with the estimated timing. Approve it, or ask for changes.
5. It sets the style with `set_style`: light, dark or both, a palette,
   your logo, the title and end cards.
6. It checks the project with `check`, renders it with `render`, and
   follows the job with `render_status` until the files are written. It
   can stop a render with `cancel_render`.

[This video](docs/clips/4.4-render-job-walkthrough.mp4), on how a render
job runs in explAIn-it, was made from Claude Code, run headless
(`claude -p`) with only the explAIn-it tools and read access to this
repository. No one could reply, so the prompt approved the graph and the
script in advance:

> Use explain-it to make a short video explaining how a render job runs in
> this repository: from an agent calling the render MCP tool, through the
> render queue, to the MP4, captions and poster on disk (and what happens
> on cancel). This is a non-interactive run, so I approve the graph and the
> script in advance: show me the Mermaid and the script in your messages
> as the guide says, but carry on without waiting for my reply. Keep it to
> about 30–45 seconds of video. Use the light theme at 720p.

The video, its captions (`.srt`) and a poster are in
`projects/<project>/out/<time>/<theme>/`. The preview link shows the project
in the browser at any point. To render again from a terminal:

```sh
npx explain-it render projects/<project> --theme both
```

## Develop

```sh
npm install
npm run dev         # the app with hot reload on http://127.0.0.1:3000
npm test            # the tests; the Chrome and ffmpeg ones skip themselves without them
```

[`CONTRIBUTING.md`](CONTRIBUTING.md) says how a change is made and reviewed,
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) how the code fits together, and
[`AGENTS.md`](AGENTS.md) every command and rule (coding agents start there).

## Licence

[MIT](LICENSE)
