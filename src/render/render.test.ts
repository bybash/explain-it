import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { beatOptions, buildBeats } from "../engine/beats/build.ts";
import { formatErrors } from "../schema/errors.ts";
import { parseStoryboard } from "../schema/storyboard.ts";
import { FPS, frameTimes } from "./frames.ts";
import { loadProject } from "./load.ts";
import { buildRenderPage, serveRenderPage } from "./page.ts";
import { renderProject } from "./render.ts";

// A real render needs Chrome and ffmpeg; without them the test is skipped, not failed.
const hasFfmpeg = ["ffmpeg", "ffprobe"].every((tool) => spawnSync(tool, ["-version"]).status === 0);
const hasChrome = await chromium
  .launch({ channel: "chrome" })
  .then((browser) => browser.close().then(() => true))
  .catch(() => false);

/** The example's graph and layout with a short storyboard: about four seconds. */
const shortProject = async () => {
  const example = await loadProject(
    new URL("../../examples/oauth-login/", import.meta.url).pathname,
  );
  if (!example.ok) throw new Error(formatErrors(example.errors).join("\n"));
  const storyboard = parseStoryboard(
    {
      version: 1,
      scenes: [
        {
          id: "short",
          title: "Short",
          nodes: ["user", "browser"],
          beats: [
            {
              id: "one",
              caption: "Start.",
              say: "Go.",
              actions: [{ type: "appear", node: "user" }],
            },
            {
              id: "two",
              caption: "Code.",
              actions: [{ type: "badge", node: "browser", text: "code", tone: "info" }],
            },
            {
              id: "three",
              caption: "Done.",
              actions: [{ type: "badge", node: "user", text: "ok", tone: "ok" }],
            },
          ],
        },
      ],
    },
    example.value.graph,
  );
  if (!storyboard.ok) throw new Error(formatErrors(storyboard.errors).join("\n"));
  return { ...example.value, storyboard: storyboard.value };
};

type Probe = {
  streams: {
    codec_name: string;
    width: number;
    height: number;
    r_frame_rate: string;
    nb_frames: string;
  }[];
};

describe.skipIf(!hasFfmpeg || !hasChrome)("renderProject (Chrome and ffmpeg)", () => {
  const out = mkdtempSync(join(tmpdir(), "explain-it-render-"));
  let server: Awaited<ReturnType<typeof serveRenderPage>>;

  beforeAll(async () => {
    await buildRenderPage();
    server = await serveRenderPage();
  }, 60_000);
  afterAll(async () => {
    await server?.close();
    rmSync(out, { recursive: true, force: true });
  });

  it("writes an H.264 video, its captions and a poster for each theme", async () => {
    const project = await shortProject();
    const results = await renderProject({
      project,
      settings: { themes: ["light"], resolution: "720p" },
      outDir: out,
      pageUrl: server.url,
    });
    expect(results.map((r) => r.theme)).toEqual(["light"]);
    const [light] = results;
    if (!light) throw new Error("no result");

    const probe = JSON.parse(
      execFileSync("ffprobe", [
        ...["-v", "error", "-select_streams", "v:0", "-count_frames"],
        ...["-show_entries", "stream=codec_name,width,height,r_frame_rate,nb_frames"],
        ...["-of", "json", light.video],
      ]).toString(),
    ) as Probe;
    const plan = buildBeats(project.storyboard, project.graph, beatOptions(project.config));
    expect(probe.streams[0]).toEqual({
      codec_name: "h264",
      width: 1280,
      height: 720,
      r_frame_rate: `${FPS}/1`,
      nb_frames: String(frameTimes(plan.duration).length),
    });

    // The example's title card holds 8 s (120 characters) and fades over 0.8 s before the first scene.
    expect(readFileSync(light.captions, "utf8")).toBe("1\n00:00:09,100 --> 00:00:09,500\nGo.\n");

    const poster = readFileSync(light.poster);
    expect(poster.subarray(1, 4).toString()).toBe("PNG");
    expect([poster.readUInt32BE(16), poster.readUInt32BE(20)]).toEqual([1280, 720]);
  }, 120_000);

  it("writes the same video with four pages capturing in parallel as with one", async () => {
    const project = await shortProject();
    const render = (pages: number) =>
      renderProject({
        project,
        settings: { themes: ["dark"], resolution: "720p" },
        outDir: join(out, `pages-${pages}`),
        pageUrl: server.url,
        pages,
      });
    const [[one], [four]] = [await render(1), await render(4)];
    if (!one || !four) throw new Error("no result");
    expect(readFileSync(four.video).equals(readFileSync(one.video))).toBe(true);
    expect(readFileSync(four.poster).equals(readFileSync(one.poster))).toBe(true);
  }, 240_000);
});
