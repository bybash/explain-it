import { useEffect, useRef, useState } from "react";
import { formatErrors, type Validated } from "../schema/errors.ts";

/** Which sample: the voice or the music. One plays at a time. */
export type SampleSource = "voice" | "music";

export type SampleState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" | "playing"; readonly source: SampleSource }
  | { readonly kind: "failed"; readonly source: SampleSource; readonly message: string };

/** Asks the API for a sound; the signal stops the request. */
export type FetchSound = (signal: AbortSignal) => Promise<Validated<Blob>>;

export type SamplePlayer = {
  readonly state: SampleState;
  readonly play: (source: SampleSource, fetchSound: FetchSound) => void;
  /** Stops what plays, or the request still on its way. */
  readonly stop: () => void;
};

/**
 * The style gate's one player for samples: a new one stops the last,
 * whichever it was, and Stop also cancels a sample still being made, such as
 * the first voice while its model downloads. Its state says which sample is
 * being made, playing, or what went wrong, in the API's words.
 */
export const useSamplePlayer = (): SamplePlayer => {
  const [state, setState] = useState<SampleState>({ kind: "idle" });
  const audio = useRef<HTMLAudioElement | undefined>(undefined);
  const request = useRef<AbortController | undefined>(undefined);

  const release = () => {
    request.current?.abort();
    request.current = undefined;
    const sound = audio.current;
    audio.current = undefined;
    if (!sound) return;
    sound.pause();
    URL.revokeObjectURL(sound.src);
  };
  // Whatever plays stops when the panel goes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `release` only reads refs.
  useEffect(() => release, []);

  const play = async (source: SampleSource, fetchSound: FetchSound) => {
    release();
    const controller = new AbortController();
    request.current = controller;
    setState({ kind: "loading", source });
    try {
      const sound = await fetchSound(controller.signal);
      if (controller.signal.aborted) return;
      if (!sound.ok)
        return setState({ kind: "failed", source, message: formatErrors(sound.errors).join("; ") });
      const element = new Audio(URL.createObjectURL(sound.value));
      audio.current = element;
      element.onended = () => {
        if (audio.current !== element) return;
        release();
        setState({ kind: "idle" });
      };
      setState({ kind: "playing", source });
      await element.play();
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : String(error);
      setState({ kind: "failed", source, message });
    }
  };

  return {
    state,
    play: (source, fetchSound) => void play(source, fetchSound),
    stop: () => {
      release();
      setState({ kind: "idle" });
    },
  };
};
