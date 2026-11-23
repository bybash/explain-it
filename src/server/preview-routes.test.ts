import { mkdtempSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakeMix } from "../audio/fake-mix.testing.ts";
import { fakeTts } from "../audio/fake-tts.testing.ts";
import {
  type PreviewChecks,
  PreviewChecksSchema,
  type PreviewSound,
  PreviewSoundSchema,
} from "../schema/api.ts";
import type { CheckReport } from "../schema/checks.ts";
import { createApp } from "./app.ts";
import { copyExample } from "./example.testing.ts";
import { settingsStore } from "./settings.ts";

let projectsDir: string;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  projectsDir = mkdtempSync(join(tmpdir(), "explain-it-preview-routes-"));
  copyExample(projectsDir, "oauth");
  app = createApp({
    projectsDir,
    now: () => new Date("2026-11-23T10:00:00.000Z"),
    tts: fakeTts().tts,
    mixSoundtrack: fakeMix().mix,
    // CI has no ffmpeg; the fake mix needs none.
    missingRenderTools: async () => [],
    // The checks need Chrome; this stand-in writes a report and its contact sheet as they do.
    runChecks: async ({ dir }) => {
      const report: CheckReport = {
        version: 1,
        checkedAt: "2026-11-23T10:00:00.000Z",
        beats: 10,
        warnings: [
          { check: "loudness", message: "the mix is at -19.4 LUFS; it should be -16 ± 1" },
        ],
        skipped: [],
        contactSheet: { full: "contact-sheet.png", small: "contact-sheet.jpg" },
      };
      await writeFile(join(dir, "contact-sheet.png"), "a png");
      await writeFile(join(dir, "contact-sheet.jpg"), "a jpeg");
      await writeFile(join(dir, "checks.json"), JSON.stringify(report));
      return report;
    },
    settings: settingsStore({ envFile: join(projectsDir, ".env"), environment: {} }),
  });
});
afterEach(() => rmSync(projectsDir, { recursive: true, force: true }));

/** Asks for the sound as the page does: a POST with a JSON body, as the API takes every POST. */
const start = (slug: string) =>
  app.request(`/api/projects/${slug}/preview-sound`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });

const status = async (): Promise<PreviewSound> =>
  PreviewSoundSchema.parse(await (await app.request("/api/projects/oauth/preview-sound")).json());

describe("the preview's sound", () => {
  it("starts on a POST, reports its progress, and serves the soundtrack once ready", async () => {
    expect(await status()).toEqual({ state: "idle" });
    const started = await start("oauth");
    expect(started.status).toBe(200);
    expect(["speaking", "mixing", "ready"]).toContain(
      PreviewSoundSchema.parse(await started.json()).state,
    );

    let now = await status();
    for (let i = 0; i < 200 && now.state !== "ready"; i++) {
      await new Promise((r) => setTimeout(r, 10));
      now = await status();
    }
    expect(now.state).toBe("ready");
    if (now.state !== "ready") return;
    expect(Object.keys(now.narration)).toHaveLength(10);

    const sound = await app.request(`/api/projects/oauth/preview-sound/${now.key}.wav`);
    expect(sound.status).toBe(200);
    expect(sound.headers.get("content-type")).toBe("audio/wav");
  });

  it("serves no soundtrack for a key that is not the ready one", async () => {
    const response = await app.request(`/api/projects/oauth/preview-sound/${"0".repeat(32)}.wav`);
    expect(response.status).toBe(404);
  });

  it("names what the preview needs", async () => {
    rmSync(join(projectsDir, "oauth", "storyboard.json"));
    const response = await start("oauth");
    expect(response.status).toBe(422);
    expect((await response.json()).errors[0].path).toBe("storyboard.json");
  });

  it("answers 404 for a project that does not exist", async () => {
    expect((await start("nope")).status).toBe(404);
    expect((await app.request("/api/projects/nope/preview-sound")).status).toBe(404);
  });
});

/** Starts the checks as the page does. */
const startChecks = (slug: string) =>
  app.request(`/api/projects/${slug}/checks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });

const checks = async (): Promise<PreviewChecks> =>
  PreviewChecksSchema.parse(await (await app.request("/api/projects/oauth/checks")).json());

describe("the preview's checks", () => {
  it("run on a POST, report how far they are, then give the report and its contact sheet", async () => {
    expect(await checks()).toEqual({ run: { state: "idle" }, report: null, upToDate: false });
    expect((await app.request("/api/projects/oauth/checks/contact-sheet.png")).status).toBe(404);

    const started = await startChecks("oauth");
    expect(started.status).toBe(200);
    let now = await checks();
    for (let i = 0; i < 300 && now.run.state !== "done"; i++) {
      await new Promise((r) => setTimeout(r, 10));
      now = await checks();
    }
    expect(now.run).toEqual({ state: "done" });
    expect(now.report?.warnings).toHaveLength(1);

    const png = await app.request("/api/projects/oauth/checks/contact-sheet.png");
    expect(png.status).toBe(200);
    expect(png.headers.get("content-type")).toBe("image/png");
    expect(await png.text()).toBe("a png");
    const jpeg = await app.request("/api/projects/oauth/checks/contact-sheet.jpg");
    expect(jpeg.headers.get("content-type")).toBe("image/jpeg");
  });

  it("names what the checks need", async () => {
    rmSync(join(projectsDir, "oauth", "storyboard.json"));
    const response = await startChecks("oauth");
    expect(response.status).toBe(422);
    expect((await response.json()).errors[0].path).toBe("storyboard.json");
  });

  it("answers 404 for a project that does not exist", async () => {
    expect((await startChecks("nope")).status).toBe(404);
    expect((await app.request("/api/projects/nope/checks")).status).toBe(404);
    expect((await app.request("/api/projects/nope/checks/contact-sheet.png")).status).toBe(404);
  });
});
