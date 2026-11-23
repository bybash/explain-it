import { readFile } from "node:fs/promises";
import type { Context, Hono } from "hono";
import { dbToGain } from "../audio/level.ts";
import { musicPlan, renderMusic } from "../audio/music.ts";
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
    const text =
      opened.value.storyboard?.scenes.flatMap((s) => s.beats).find((b) => b.say)?.say ??
      SAMPLE_LINE;
    const line = await speakLine({
      projectDir: projectDir(projectsDir, slug),
      text,
      voice: { ...DEFAULT_CONFIG.voice, id: query.value.voice, speed: query.value.speed },
      tts,
    });
    return wav(c, await readFile(line.file));
  });

  app.get("/api/samples/music", (c) => {
    const query = parseWith(MusicSampleQuerySchema, c.req.query());
    if (!query.ok) return errorResponse(c, 400, query.errors);
    const { mood, seed, volumeDb } = query.value;
    const music = renderMusic(musicPlan({ mood, seed, seconds: MUSIC_SAMPLE_SECONDS }));
    // Played as loud as the mix plays it at the default volume, and quieter or louder from
    // there, but never past full scale, which would clip.
    const peak = music.samples.reduce((top, s) => Math.max(top, Math.abs(s)), 0);
    const gain = Math.min(
      dbToGain(volumeDb - DEFAULT_CONFIG.music.volumeDb),
      1 / Math.max(peak, 1e-9),
    );
    const samples = music.samples.map((s) => s * gain);
    return wav(c, encodeWav({ samples, sampleRate: music.sampleRate }));
  });
};
