import { describe, expect, it } from "vitest";
import { GIF_SIZES } from "../schema/render.ts";
import { encodeArgs, gifArgs, posterArgs } from "./encode.ts";

const argAfter = (args: readonly string[], flag: string) => args[args.indexOf(flag) + 1];

describe("encodeArgs", () => {
  const args = encodeArgs({ fps: 30, resolution: "1080p", out: "/tmp/out/video.mp4" });

  it("reads PNG frames from stdin at the capture rate", () => {
    expect(argAfter(args, "-f")).toBe("image2pipe");
    expect(argAfter(args, "-framerate")).toBe("30");
    expect(argAfter(args, "-i")).toBe("-");
  });

  it("writes H.264 in yuv420p, ready to stream, to the output path last", () => {
    expect(argAfter(args, "-c:v")).toBe("png");
    expect(args.lastIndexOf("-c:v")).toBeGreaterThan(args.indexOf("-i"));
    expect(args[args.lastIndexOf("-c:v") + 1]).toBe("libx264");
    expect(argAfter(args, "-pix_fmt")).toBe("yuv420p");
    expect(argAfter(args, "-movflags")).toBe("+faststart");
    expect(args.at(-1)).toBe("/tmp/out/video.mp4");
  });

  it("adds the soundtrack as AAC at 192 kbps when there is one, and no audio when not", () => {
    expect(args).not.toContain("-c:a");
    const voiced = encodeArgs({
      fps: 30,
      resolution: "1080p",
      out: "v.mp4",
      audio: "/tmp/audio.wav",
    });
    const inputs = voiced.flatMap((arg, i) => (arg === "-i" ? [voiced[i + 1]] : []));
    expect(inputs).toEqual(["-", "/tmp/audio.wav"]);
    expect(voiced.join(" ")).toContain("-map 0:v -map 1:a");
    expect(argAfter(voiced, "-c:a")).toBe("aac");
    expect(argAfter(voiced, "-b:a")).toBe("192k");
    expect(voiced.at(-1)).toBe("v.mp4");
  });

  it("keeps 1080p frames as they are, and scales them down for 720p", () => {
    expect(args).not.toContain("-vf");
    const small = encodeArgs({ fps: 30, resolution: "720p", out: "v.mp4" });
    expect(argAfter(small, "-vf")).toMatch(/^scale=1280:720/);
  });
});

describe("posterArgs", () => {
  it("writes the one PNG frame from stdin, scaled like the video", () => {
    const big = posterArgs({ resolution: "1080p", out: "poster.png" });
    expect(argAfter(big, "-i")).toBe("-");
    expect(argAfter(big, "-frames:v")).toBe("1");
    expect(big).not.toContain("-vf");
    expect(big.at(-1)).toBe("poster.png");
    const small = posterArgs({ resolution: "720p", out: "poster.png" });
    expect(argAfter(small, "-vf")).toMatch(/^scale=1280:720/);
  });
});

describe("gifArgs", () => {
  it("cuts the clip from the video, with no sound, at the size asked, through a palette made for it", () => {
    const args = gifArgs({
      video: "in.mp4",
      start: 14,
      end: 25,
      width: 720,
      fps: 10,
      out: "scene.gif",
    });
    expect(args.slice(0, 9)).toEqual([
      "-y",
      "-loglevel",
      "error",
      "-ss",
      "14",
      "-t",
      "11",
      "-i",
      "in.mp4",
    ]);
    expect(args).toContain("-an");
    const filter = args[args.indexOf("-filter_complex") + 1];
    expect(filter).toContain("fps=10,scale=720:-2");
    expect(filter).toMatch(/palettegen.*paletteuse/);
    expect(args.at(-1)).toBe("scene.gif");
  });

  it("tries smaller and smaller sizes, the first at most as big as a 720p video", () => {
    expect(GIF_SIZES.length).toBeGreaterThan(1);
    for (const [a, b] of GIF_SIZES.slice(1).map((s, i) => [GIF_SIZES[i], s] as const))
      expect((b?.width ?? 0) * (b?.fps ?? 0)).toBeLessThan((a?.width ?? 0) * (a?.fps ?? 0));
  });
});
