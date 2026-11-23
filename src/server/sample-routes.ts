import { readFile } from "node:fs/promises";
import type { Context, Hono } from "hono";
import { musicSample } from "../audio/music.ts";
import type { TtsProvider } from "../audio/tts.ts";
import { speakLine } from "../audio/voice.ts";
import { encodeWav } from "../audio/wav.ts";
import {
  MUSIC_SAMPLE_SECONDS,
  MusicSampleQuerySchema,
  SAMPLE_LINE,
  VoiceSampleQuerySchema,
} from "../schema/api.ts";
import { DEFAULT_CONFIG } from "../schema/config.ts";
import { parseWith } from "../schema/errors.ts";
import { openProject, projectDir } from "./projects.ts";
import { errorResponse, noProject } from "./responses.ts";

const wav = (c: Context, bytes: Uint8Array) =>
  c.body(new Uint8Array(bytes), 200, { "content-type": "audio/wav", "cache-control": "no-store" });

/**
 * The style gate's samples (SPEC, User flow): the voice speaking the
 * script's first line, and a few seconds of the music. A voice sample is
 * cached as the video's lines are, so a line heard here is not spoken again
 * for the render; the first one may wait for the voice model to download.
 */
export const sampleRoutes = (
  app: Hono,
  { projectsDir, tts }: { projectsDir: string; tts: TtsProvider },
) => {
  app.get("/api/projects/:slug/samples/voice", async (c) => {
    const slug = c.req.param("slug");
    const query = parseWith(VoiceSampleQuerySchema, c.req.query());
    if (!query.ok) return errorResponse(c, 400, query.errors);
    const opened = await openProject(projectsDir, slug);
    if (!opened) return noProject(c, slug);
    if (!opened.ok) return errorResponse(c, 422, opened.errors);
    const { storyboard, problems } = opened.value;
    // A script that did not read has no line to speak; a sentence of our own would hide that.
    const broken = problems.filter((p) => p.path.startsWith("storyboard.json"));
    if (broken.length > 0) return errorResponse(c, 422, broken);
    const text = storyboard?.scenes.flatMap((s) => s.beats).find((b) => b.say)?.say ?? SAMPLE_LINE;
    try {
      const line = await speakLine({
        projectDir: projectDir(projectsDir, slug),
        text,
        voice: { ...DEFAULT_CONFIG.voice, id: query.value.voice, speed: query.value.speed },
        tts,
      });
      return wav(c, await readFile(line.file));
    } catch (error) {
      // The model could not load or run: its message says what to do (the network, a cut download).
      const message = error instanceof Error ? error.message : String(error);
      return errorResponse(c, 503, [{ path: "voice", message }]);
    }
  });

  app.get("/api/samples/music", (c) => {
    const query = parseWith(MusicSampleQuerySchema, c.req.query());
    if (!query.ok) return errorResponse(c, 400, query.errors);
    return wav(c, encodeWav(musicSample({ ...query.value, seconds: MUSIC_SAMPLE_SECONDS })));
  });
};
