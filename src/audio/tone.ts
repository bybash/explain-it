import type { TtsProvider } from "./tts.ts";

const RATE = 24_000;
/** How long a word lasts at speed 1, and the tone's pitch and level. */
const WORD_SECONDS = 0.25;
const HZ = 440;
const LEVEL = 0.2;

/**
 * A stand-in voice: a short tone for each word, at the speed asked, with no
 * model to load. The app uses it when `VOICE=tone`, so the browser test can
 * hear a narration without downloading Kokoro; its id keeps its lines apart
 * from spoken ones in the cache.
 */
export const toneProvider = (): TtsProvider => ({
  id: "tone-1",
  generate: async (text, { speed }) => {
    const words = text.split(/\s+/).filter(Boolean).length;
    const samples = new Float32Array(Math.round((words * WORD_SECONDS * RATE) / speed));
    for (let i = 0; i < samples.length; i++)
      samples[i] = LEVEL * Math.sin((2 * Math.PI * HZ * i) / RATE);
    return { samples, sampleRate: RATE };
  },
});
