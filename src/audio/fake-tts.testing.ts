import type { SpeakOptions, TtsProvider } from "./tts.ts";

/**
 * A provider for tests: a tenth of a second of tone per word, no model. It
 * remembers what it was asked, and fails every line when given a message.
 */
export const fakeTts = ({ id = "fake-1", failWith }: { id?: string; failWith?: string } = {}) => {
  const asked: ({ text: string } & SpeakOptions)[] = [];
  const tts: TtsProvider = {
    id,
    generate: async (text, options) => {
      asked.push({ text, ...options });
      if (failWith) throw new Error(failWith);
      const words = text.split(/\s+/).length;
      return { samples: new Float32Array(words * 2_400).fill(0.25), sampleRate: 24_000 };
    },
  };
  return { tts, asked };
};
