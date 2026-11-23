import { useEffect, useRef, useState } from "react";
import type { OpenedProject } from "../schema/api.ts";
import type { Config, LogoImages } from "../schema/config.ts";
import type { Narration } from "../schema/narration.ts";
import { type BeatSpan, FromPreviewSchema, type Mark, type ToPreview } from "./preview-protocol.ts";

/** How long changes pause before the preview draws them again. */
const PAUSE_MS = 150;

/**
 * Drives the preview page (`preview.html`) in an iframe: draws the project
 * with the config, logo and narration given, again whenever they change,
 * and seeks it. Answers the video's length, its marks and each beat's place,
 * or what kept it from drawing.
 */
export const usePreviewFrame = ({
  opened,
  config,
  mode,
  logo,
  narration,
}: {
  opened: OpenedProject;
  config: Config;
  mode: "light" | "dark";
  logo: LogoImages | undefined;
  narration?: Narration | undefined;
}) => {
  const frame = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [duration, setDuration] = useState(0);
  const [marks, setMarks] = useState<readonly Mark[]>([]);
  const [beats, setBeats] = useState<readonly BeatSpan[]>([]);
  const [problem, setProblem] = useState<string | undefined>();
  /** Where the video was last sought, so a new drawing shows the same moment. */
  const at = useRef(0);
  const { graph, storyboard, layout } = opened;

  const send = (message: ToPreview) =>
    frame.current?.contentWindow?.postMessage(message, location.origin);

  useEffect(() => {
    const listen = (event: MessageEvent<unknown>) => {
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow) return;
      const message = FromPreviewSchema.safeParse(event.data);
      if (!message.success) return;
      if (message.data.type === "failed") return setProblem(message.data.message);
      setProblem(undefined);
      setDuration(message.data.duration);
      setMarks(message.data.marks);
      setBeats(message.data.beats);
    };
    addEventListener("message", listen);
    return () => removeEventListener("message", listen);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `send` only reads the iframe's ref.
  useEffect(() => {
    if (!loaded || !graph || !storyboard || !layout) return;
    const timer = setTimeout(
      () =>
        send({
          type: "draw",
          graph,
          storyboard,
          layout,
          config,
          mode,
          ...(logo ? { logo } : {}),
          ...(narration ? { narration } : {}),
          at: at.current,
        }),
      PAUSE_MS,
    );
    return () => clearTimeout(timer);
  }, [loaded, graph, storyboard, layout, config, mode, logo, narration]);

  return {
    /** Spread on the iframe. */
    frameProps: {
      ref: frame,
      src: "/preview.html",
      // After the page's own script has run, so it is listening; a message from it could be missed.
      onLoad: () => setLoaded(true),
    },
    ready: Boolean(graph && storyboard && layout),
    duration,
    marks,
    beats,
    problem,
    seek: (t: number) => {
      at.current = t;
      send({ type: "seek", at: t });
    },
  };
};
