import { join } from "node:path";
import { env } from "@huggingface/transformers";
import { KokoroTTS } from "kokoro-js";
import type { TtsProvider } from "./tts.ts";

/** Kokoro-82M as ONNX, 8-bit: about 92 MB, English voices (SPEC, Audio). */
const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
const DTYPE = "q8";

/** Where the model is kept: `<cacheDir>/models/`, downloaded on first use. */
const modelsDir = (cacheDir: string) => join(cacheDir, "models");

/** The model's weights once downloaded; its presence means no download is needed. */
export const kokoroModelFile = (cacheDir: string): string =>
  join(modelsDir(cacheDir), MODEL, "onnx", "model_quantized.onnx");

export type KokoroOptions = {
  /** The app's cache folder (`CACHE_DIR`, `./cache` by default). */
  readonly cacheDir: string;
};

/**
 * Text to speech with Kokoro, on the CPU. The model loads on the first line
 * and stays loaded; a load that fails is tried again on the next line.
 */
export const kokoroProvider = ({ cacheDir }: KokoroOptions): TtsProvider => {
  let loading: Promise<KokoroTTS> | undefined;
  const load = (): Promise<KokoroTTS> => {
    if (!loading) {
      // transformers.js keeps one cache folder for the process; only this provider loads models.
      env.cacheDir = modelsDir(cacheDir);
      loading = KokoroTTS.from_pretrained(MODEL, { dtype: DTYPE, device: "cpu" }).catch((error) => {
        loading = undefined;
        throw new Error(`the Kokoro voice model did not load (${MODEL}): ${error}`);
      });
    }
    return loading;
  };
  return {
    id: `${MODEL}:${DTYPE}`,
    generate: async (text, { voice, speed }) => {
      const tts = await load();
      const audio = await tts.generate(text, { voice, speed });
      return { samples: audio.audio, sampleRate: audio.sampling_rate };
    },
  };
};
