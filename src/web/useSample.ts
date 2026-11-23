import { useEffect, useRef, useState } from "react";
import { ErrorsResponseSchema } from "../schema/api.ts";
import { formatErrors } from "../schema/errors.ts";

export type SampleState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "playing" }
  | { readonly kind: "failed"; readonly message: string };

/**
 * Fetches a sound from the API and plays it, one at a time: a new one stops
 * the last. Its state says whether it is still being made, playing, or what
 * went wrong, in the API's words.
 */
export const useSample = () => {
  const [state, setState] = useState<SampleState>({ kind: "idle" });
  const audio = useRef<HTMLAudioElement | undefined>(undefined);
  const asked = useRef(0);

  const stop = () => {
    audio.current?.pause();
    if (audio.current) URL.revokeObjectURL(audio.current.src);
    audio.current = undefined;
  };
  // A sound still playing stops when the panel goes.
  useEffect(
    () => () => {
      audio.current?.pause();
    },
    [],
  );

  const play = async (url: string) => {
    stop();
    const mine = ++asked.current;
    setState({ kind: "loading" });
    try {
      const response = await fetch(url);
      if (mine !== asked.current) return;
      if (!response.ok) {
        const errors = ErrorsResponseSchema.safeParse(await response.json().catch(() => null));
        return setState({
          kind: "failed",
          message: errors.success
            ? formatErrors(errors.data.errors).join("; ")
            : `the server sent ${response.status}`,
        });
      }
      const sound = new Audio(URL.createObjectURL(await response.blob()));
      if (mine !== asked.current) return;
      audio.current = sound;
      sound.onended = () => setState({ kind: "idle" });
      setState({ kind: "playing" });
      await sound.play();
    } catch (error) {
      if (mine === asked.current)
        setState({
          kind: "failed",
          message: error instanceof Error ? error.message : String(error),
        });
    }
  };

  return {
    state,
    play,
    stop: () => {
      asked.current++;
      stop();
      setState({ kind: "idle" });
    },
  };
};
