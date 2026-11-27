import type { VoiceId } from "../schema/voices.ts";
import type { Audio } from "./wav.ts";

/** How a line is spoken. */
export type SpeakOptions = { readonly voice: VoiceId; readonly speed: number };

/**
 * Text to speech: one of the five ports (AGENTS.md). `kokoro.ts` is the real
 * one; tests pass a fake.
 */
export type TtsProvider = {
  /** The model and its settings. Part of every line's cache key, so a new model regenerates. */
  readonly id: string;
  /** Speaks one line. Throws when the model cannot load or run: a broken environment. */
  readonly generate: (text: string, options: SpeakOptions) => Promise<Audio>;
  /** Lets the model go once the voice is done with, so a render that follows has its memory. */
  readonly close?: () => Promise<void>;
};
