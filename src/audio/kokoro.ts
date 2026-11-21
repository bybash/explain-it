import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { KokoroTTS } from "kokoro-js";
import type { TtsProvider } from "./tts.ts";

/** Kokoro-82M as ONNX, 8-bit, English voices (SPEC, Audio). */
const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
const DTYPE = "q8";

/** Where the model is kept: `<cacheDir>/models/`, downloaded on first use. */
const modelsDir = (cacheDir: string) => join(cacheDir, "models");

/** The model's weights once downloaded; its presence means no download is needed. */
export const kokoroModelFile = (cacheDir: string): string =>
  join(modelsDir(cacheDir), MODEL, "onnx", "model_quantized.onnx");

/** The installed kokoro-js version: its voices ship in the package, so it is part of every line's key. */
const kokoroVersion = (): string => {
  const require = createRequire(import.meta.url);
  // The package's exports hide package.json, so it is found next to the entry point.
  const entry = require.resolve("kokoro-js");
  const manifest = JSON.parse(readFileSync(join(dirname(entry), "..", "package.json"), "utf8"));
  return String(manifest.version);
};

export type KokoroOptions = {
  /** The app's cache folder (`CACHE_DIR`, `./cache` by default). */
  readonly cacheDir: string;
};

/**
 * Text to speech with Kokoro, on the CPU. kokoro-js and transformers.js load
 * with the first line, not with the app, and the model stays loaded; a load
 * that fails is tried again on the next line.
 */
export const kokoroProvider = ({ cacheDir }: KokoroOptions): TtsProvider => {
  let loading: Promise<KokoroTTS> | undefined;
  const load = (): Promise<KokoroTTS> => {
    loading ??= (async () => {
      const [{ env }, { KokoroTTS }] = await Promise.all([
        import("@huggingface/transformers"),
        import("kokoro-js"),
      ]);
      // transformers.js keeps one cache folder for the process; only this provider loads models.
      env.cacheDir = modelsDir(cacheDir);
      return KokoroTTS.from_pretrained(MODEL, { dtype: DTYPE, device: "cpu" });
    })().catch((error) => {
      loading = undefined;
      throw new Error(
        `the voice model did not load: ${error instanceof Error ? error.message : error}. ` +
          `The first use downloads it from huggingface.co into ${join(modelsDir(cacheDir), MODEL)}; ` +
          "check the network, and if a download was cut short, delete that folder and try again",
      );
    });
    return loading;
  };
  return {
    id: `${MODEL}:${DTYPE}:kokoro-js@${kokoroVersion()}`,
    generate: async (text, { voice, speed }) => {
      const tts = await load();
      const audio = await tts.generate(text, { voice, speed });
      return { samples: audio.audio, sampleRate: audio.sampling_rate };
    },
  };
};
