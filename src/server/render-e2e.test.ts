import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import graphJson from "../../examples/oauth-login/graph.json" with { type: "json" };
import { createApp } from "./app.ts";

// A real render needs Chrome and ffmpeg; without them the test is skipped, not failed.
const hasFfmpeg = ["ffmpeg", "ffprobe"].every((tool) => spawnSync(tool, ["-version"]).status === 0);
const hasChrome = await chromium
  .launch({ channel: "chrome" })
  .then((browser) => browser.close().then(() => true))
  .catch(() => false);

const { $schema: _schema, ...graph } = graphJson;

/** A storyboard of about four seconds over two of the example's nodes. */
const storyboard = (beats: number) => ({
  version: 1,
  scenes: [
    {
      id: "short",
      title: "Short",
      nodes: ["user", "browser"],
      beats: Array.from({ length: beats }, (_, i) => ({
        id: `beat_${i + 1}`,
        caption: `Step ${i + 1}.`,
        say: i === 0 ? "Go." : undefined,
        actions: i === 0 ? [{ type: "appear", node: "user" }] : [],
      })).map(({ say, ...beat }) => (say ? { ...beat, say } : beat)),
    },
  ],
});

describe.skipIf(!hasFfmpeg || !hasChrome)(
  "from create_project to an MP4 through MCP tools alone",
  () => {
    let projectsDir: string;
    let app: ReturnType<typeof createApp>;
    let id = 0;

    beforeAll(() => {
      projectsDir = mkdtempSync(join(tmpdir(), "explain-it-e2e-"));
      app = createApp({ projectsDir, now: () => new Date() });
    });
    afterAll(() => rmSync(projectsDir, { recursive: true, force: true }));

    /** Calls a tool over /mcp, as an IDE does, and returns its JSON result. */
    const tool = async (name: string, args: Record<string, unknown>) => {
      const response = await app.request("http://127.0.0.1:3000/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: ++id,
          method: "tools/call",
          params: { name, arguments: args },
        }),
      });
      const body = await response.json();
      const text = body.result.content[0].text as string;
      if (body.result.isError) throw new Error(`${name}:\n${text}`);
      return JSON.parse(text);
    };

    /** Asks render_status until the job leaves `queued` and `running`, or `until` says stop. */
    const follow = async (
      job: string,
      until: (status: { state: string; progress?: unknown }) => boolean = () => false,
    ) => {
      for (;;) {
        const status = await tool("render_status", { job });
        if (until(status) || !["queued", "running"].includes(status.state)) return status;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    };

    it("renders the video, its captions and its poster", async () => {
      const { slug } = await tool("create_project", { graph });
      await tool("set_storyboard", { slug, storyboard: storyboard(3) });
      await tool("set_style", { slug, config: { output: { resolution: "720p" } } });
      expect((await tool("check", { slug })).ready).toBe(true);

      const { job } = await tool("render", { slug, theme: "light" });
      const done = await follow(job.id);
      expect(done.state).toBe("done");
      const [light] = done.outputs;
      expect(light.video.startsWith(join(projectsDir, slug, "out"))).toBe(true);
      const probe = JSON.parse(
        execFileSync("ffprobe", [
          ...["-v", "error", "-select_streams", "v:0"],
          ...["-show_entries", "stream=codec_name,width,height", "-of", "json", light.video],
        ]).toString(),
      );
      expect(probe.streams[0]).toEqual({ codec_name: "h264", width: 1280, height: 720 });
      expect(existsSync(light.captions)).toBe(true);
      expect(existsSync(light.poster)).toBe(true);
    }, 180_000);

    it("cancels a running render and leaves none of its files behind", async () => {
      const { slug } = await tool("create_project", { name: "Long", graph });
      await tool("set_storyboard", { slug, storyboard: storyboard(10) });
      // Both themes, cancelled in the second: the first theme's finished files must go too.
      const { job } = await tool("render", { slug, theme: "both", resolution: "720p" });
      await follow(
        job.id,
        (status) =>
          status.state === "running" &&
          (status.progress as { themeIndex?: number } | undefined)?.themeIndex === 1,
      );
      await tool("cancel_render", { job: job.id });
      const ended = await follow(job.id);
      expect(ended.state).toBe("cancelled");
      const out = join(projectsDir, slug, "out");
      expect(existsSync(out) ? readdirSync(out) : []).toEqual([]);
    }, 180_000);
  },
);
