import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AUDIO_RATE } from "../audio/level.ts";
import { encodeWav } from "../audio/wav.ts";
import { sheetLayout } from "../checks/sheet.ts";
import { beatOptions, buildBeats } from "../engine/beats/build.ts";
import { formatErrors } from "../schema/errors.ts";
import { parseStoryboard } from "../schema/storyboard.ts";
import { hasChrome } from "./chrome.testing.ts";
import { FPS, frameTimes } from "./frames.ts";
import { loadProject } from "./load.ts";
import { buildRenderPage, serveRenderPage } from "./page.ts";
import { renderProject } from "./render.ts";

// A real render needs Chrome and ffmpeg; without them the test is skipped, not failed.
const hasFfmpeg = ["ffmpeg", "ffprobe"].every((tool) => spawnSync(tool, ["-version"]).status === 0);

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
  let page: Awaited<ReturnType<typeof buildRenderPage>>;
  let server: Awaited<ReturnType<typeof serveRenderPage>>;

  beforeAll(async () => {
    page = await buildRenderPage();
    server = await serveRenderPage(page.dir);
  }, 60_000);
  afterAll(async () => {
    await server?.close();
    await page?.remove();
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

    // The example's title card holds 5 s (120 characters at 20 a second, 5 s at most) and fades over 0.8 s before the first scene.
    expect(readFileSync(light.captions, "utf8")).toBe("1\n00:00:06,100 --> 00:00:06,500\nGo.\n");

    // The contact sheet: the short project's three beats, one tile each, on one row.
    const sheet = readFileSync(light.contactSheet);
    expect(sheet.subarray(1, 4).toString()).toBe("PNG");
    const layout = sheetLayout({ beats: plan.beats, warnings: [], tileWidth: 480 });
    expect(layout.tiles).toHaveLength(3);
    expect([sheet.readUInt32BE(16), sheet.readUInt32BE(20)]).toEqual([layout.width, layout.height]);

    const poster = readFileSync(light.poster);
    expect(poster.subarray(1, 4).toString()).toBe("PNG");
    expect([poster.readUInt32BE(16), poster.readUInt32BE(20)]).toEqual([1280, 720]);
  }, 120_000);

  it("times the video and its captions by the measured narration", async () => {
    const short = await shortProject();
    // "Go." measured at 2.5 s, far longer than its estimate: the beat, the video and the cue stretch.
    const project = { ...short, narration: { one: 2.5 } };
    const [light] = await renderProject({
      project,
      settings: { themes: ["light"], resolution: "720p" },
      outDir: join(out, "measured"),
      pageUrl: server.url,
    });
    if (!light) throw new Error("no result");
    expect(readFileSync(light.captions, "utf8")).toBe("1\n00:00:06,100 --> 00:00:08,600\nGo.\n");
    const frames = execFileSync("ffprobe", [
      ...["-v", "error", "-select_streams", "v:0", "-count_frames"],
      ...["-show_entries", "stream=nb_frames", "-of", "csv=p=0", light.video],
    ])
      .toString()
      .trim();
    const plan = buildBeats(
      project.storyboard,
      project.graph,
      beatOptions(project.config, project.narration),
    );
    const estimated = buildBeats(short.storyboard, short.graph, beatOptions(short.config));
    expect(plan.duration).toBeGreaterThan(estimated.duration);
    expect(frames).toBe(String(frameTimes(plan.duration).length));
  }, 120_000);

  it("writes a captioned and a clean video, both with the soundtrack, and the soundtrack beside them", async () => {
    const project = await shortProject();
    const plan = buildBeats(project.storyboard, project.graph, beatOptions(project.config));
    // A quiet tone stands in for the mastered soundtrack.
    const audio = join(out, "soundtrack.wav");
    writeFileSync(
      audio,
      encodeWav({
        samples: Float32Array.from(
          { length: Math.ceil(plan.duration * AUDIO_RATE) },
          (_, i) => 0.1 * Math.sin((2 * Math.PI * 220 * i) / AUDIO_RATE),
        ),
        sampleRate: AUDIO_RATE,
      }),
    );
    const [light] = await renderProject({
      project,
      settings: { themes: ["light"], resolution: "720p" },
      outDir: join(out, "with-audio"),
      pageUrl: server.url,
      audio,
    });
    if (!light?.audio) throw new Error("no soundtrack in the result");
    expect(existsSync(light.audio)).toBe(true);
    const streams = (file: string) =>
      execFileSync("ffprobe", [
        ...["-v", "error", "-show_entries", "stream=codec_name", "-of", "csv=p=0", file],
      ])
        .toString()
        .trim()
        .split("\n");
    expect(streams(light.video)).toEqual(["h264", "aac"]);
    expect(streams(light.clean)).toEqual(["h264", "aac"]);

    // While "Go." is on screen (6.1 to 6.5 s), the two differ only in the narration band at the bottom.
    const frame = (file: string) =>
      execFileSync("ffmpeg", [
        ...["-v", "error", "-ss", "6.3", "-i", file, "-frames:v", "1"],
        ...["-f", "rawvideo", "-pix_fmt", "gray", "-"],
      ]);
    const [captioned, clean] = [frame(light.video), frame(light.clean)];
    const width = 1280;
    const height = 720;
    const band = Math.round(height * 0.85);
    /** Pixels in rows `from` to `to` that clearly differ: the caption's text, not encoder noise. */
    const changed = (from: number, to: number) => {
      let count = 0;
      for (let i = from * width; i < to * width; i++)
        if (Math.abs((captioned[i] ?? 0) - (clean[i] ?? 0)) > 48) count++;
      return count;
    };
    expect(changed(0, band)).toBeLessThan(20);
    expect(changed(band, height)).toBeGreaterThan(100);
  }, 180_000);

  it("writes the same video with four pages capturing in parallel as with one", async () => {
    // Narration captions off: one capture a frame instead of two (captioned and clean), as the
    // order frames come back in is what is tested, not what is on them.
    const short = await shortProject();
    const project = {
      ...short,
      config: { ...short.config, captions: { ...short.config.captions, narration: false } },
    };
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
    // Each theme gets its own contact sheet; this one is the dark theme's.
    expect(four.contactSheet).toBe(join(out, "pages-4", "dark", "contact-sheet.png"));
    expect(readFileSync(four.contactSheet).subarray(1, 4).toString()).toBe("PNG");
  }, 240_000);
});
