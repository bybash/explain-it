import { useEffect, useState } from "react";
import type { OpenedProject } from "../schema/api.ts";
import type { Config, LogoImages } from "../schema/config.ts";
import { clockTime } from "./preview-time.ts";
import { Pill } from "./ui.tsx";
import { usePreviewFrame } from "./usePreviewFrame.ts";

/**
 * The video as the unsaved style draws it (SPEC, User flow), with the player
 * the renderer captures, in an iframe of its own: a scrubber, and buttons for
 * the title card, each beat and the end. A video in both modes shows either.
 */
export const StylePreview = ({
  opened,
  config,
  logo,
  showing,
}: {
  opened: OpenedProject;
  config: Config;
  logo: LogoImages | undefined;
  /** A scene being changed elsewhere in the form (its camera): shown, unless it already is. */
  showing?: { readonly scene: string; readonly asked: number } | undefined;
}) => {
  const [at, setAt] = useState(0);
  const [darkShown, setDarkShown] = useState(false);
  const mode = config.theme.mode === "both" ? (darkShown ? "dark" : "light") : config.theme.mode;
  const preview = usePreviewFrame({ opened, config, mode, logo });
  const { duration, marks, problem } = preview;

  const seek = (t: number) => {
    setAt(t);
    preview.seek(t);
  };

  // Each time a scene is asked for, the preview moves to its first beat unless one of its beats is on screen.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new ask moves the preview.
  useEffect(() => {
    if (!showing) return;
    const own = marks.filter((m) => m.scene === showing.scene);
    const first = own[0];
    const last = own.at(-1);
    if (!first || !last) return;
    const inside = at >= first.at - 0.5 && at <= last.at + 0.5;
    if (!inside) seek(first.at);
  }, [showing?.asked]);

  if (!preview.ready)
    return <p className="my-4 text-muted">The preview needs the graph and the script.</p>;

  return (
    <figure className="m-0" aria-label="Preview">
      <iframe
        {...preview.frameProps}
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
          {clockTime(at)} / {clockTime(duration)}
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
