import { useEffect, useRef, useState } from "react";
import type { OpenedProject } from "../schema/api.ts";
import type { Config, LogoImages } from "../schema/config.ts";
import { FromPreviewSchema, type Mark, type ToPreview } from "./preview-protocol.ts";
import { Pill } from "./ui.tsx";

/** How long the form pauses before the preview draws it again. */
const PAUSE_MS = 150;

const seconds = (t: number) =>
  `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

/**
 * The video as the unsaved style draws it (SPEC, User flow), with the player
 * the renderer captures, in an iframe of its own: a scrubber, and buttons for
 * the title card, each beat and the end. A video in both modes shows either.
 */
export const StylePreview = ({
  opened,
  config,
  logo,
}: {
  opened: OpenedProject;
  config: Config;
  logo: LogoImages | undefined;
}) => {
  const frame = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [at, setAt] = useState(0);
  const [duration, setDuration] = useState(0);
  const [marks, setMarks] = useState<readonly Mark[]>([]);
  const [problem, setProblem] = useState<string | undefined>();
  const [darkShown, setDarkShown] = useState(false);
  const mode = config.theme.mode === "both" ? (darkShown ? "dark" : "light") : config.theme.mode;
  const { graph, storyboard, layout } = opened;
  const atRef = useRef(at);
  atRef.current = at;

  const send = (message: ToPreview) =>
    frame.current?.contentWindow?.postMessage(message, location.origin);

  useEffect(() => {
    const listen = (event: MessageEvent<unknown>) => {
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow) return;
      const message = FromPreviewSchema.safeParse(event.data);
      if (!message.success) return;
      if (message.data.type === "failed") setProblem(message.data.message);
      else {
        setProblem(undefined);
        setDuration(message.data.duration);
        setMarks(message.data.marks);
      }
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
          at: atRef.current,
        }),
      PAUSE_MS,
    );
    return () => clearTimeout(timer);
  }, [loaded, graph, storyboard, layout, config, mode, logo]);

  const seek = (t: number) => {
    setAt(t);
    send({ type: "seek", at: t });
  };

  if (!graph || !storyboard || !layout)
    return <p className="my-4 text-muted">The preview needs the graph and the script.</p>;

  return (
    <figure className="m-0" aria-label="Preview">
      <iframe
        ref={frame}
        src="/preview.html"
        // After the page's own script has run, so it is listening; a message from it could be missed.
        onLoad={() => setLoaded(true)}
        title="The video with this style"
        className="aspect-video w-full rounded-box border border-line bg-surface"
      />
      {problem && <figcaption className="mt-2 text-error text-sm">{problem}</figcaption>}
      <div className="mt-3 flex items-center gap-3">
        <input
          type="range"
          className="flex-1 accent-accent"
          min={0}
          max={duration}
          step={0.1}
          value={Math.min(at, duration)}
          onChange={(e) => seek(Number(e.target.value))}
          aria-label="Time in the video"
        />
        <span className="text-muted text-sm tabular-nums">
          {seconds(at)} / {seconds(duration)}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {marks.map((mark) => (
          <Pill key={mark.label} onClick={() => seek(mark.at)}>
            {mark.label}
          </Pill>
        ))}
        {config.theme.mode === "both" && (
          <label className="ml-auto flex items-center gap-2 text-muted text-sm">
            <input
              type="checkbox"
              checked={darkShown}
              onChange={(e) => setDarkShown(e.target.checked)}
            />
            Show the dark video
          </label>
        )}
      </div>
    </figure>
  );
};
