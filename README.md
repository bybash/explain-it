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

## Status

In development. Today an IDE's agent can make a video end to end over MCP:
it reads your repository, writes the graph and the script, and renders an
MP4 with captions, in a light or dark theme. The video is silent for now;
voice, music and the checks come next, then the web app's own chat. The
design is in [`SPEC.md`](SPEC.md) and the plan, one pull request at a time,
is in [`ROADMAP.md`](ROADMAP.md).

## Requirements

- Node 24 (`nvm use` reads `.nvmrc`).
- Google Chrome, for rendering. Another Chromium works through `CHROME_PATH`.
- ffmpeg on your `PATH`, for rendering.

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
your IDE uses it.

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
offers to connect explAIn-it. Your IDE asks before it trusts them.

## Walkthrough: explain a feature of your repository

1. Start the app (`npm start`) and open your repository in your IDE, with
   explAIn-it connected.
2. Ask the agent for a video. For example:

   > Use explain-it to make a short video explaining how a request is
   > authenticated in this repository.

   In Claude Code you can also start from the `explain_flow` prompt: type
   `/mcp__explain-it__explain_flow` and give it the topic.
3. The agent reads the guide (`get_guide`), then your code, and drafts the
   flow as a graph with `create_project`. It shows you the graph as Mermaid
   and a link to the preview. Ask for changes, or approve it.
4. It writes the script, beat by beat, with `set_storyboard` and shows it
   to you with the estimated timing. Approve it, or ask for changes.
5. It sets the style with `set_style`: the theme, a palette, your logo,
   the title and end cards.
6. It checks the project with `check`, renders it with `render`, and
   follows the job with `render_status` until the files are written. It
   can stop a render with `cancel_render`.

[This video](docs/clips/4.4-render-job-walkthrough.mp4), on how a render
job runs in explAIn-it, was made this way from Claude Code, with no edits.

The video, its captions (`.srt`) and a poster are in
`projects/<project>/out/<time>/<theme>/`. The preview link shows the project
in the browser at any point. To render again from a terminal:

```sh
npx explain-it render projects/<project> --theme both
```

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). Coding agents start at
[`AGENTS.md`](AGENTS.md).

## Licence

[MIT](LICENSE)
