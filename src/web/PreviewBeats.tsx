import { useEffect, useRef } from "react";
import type { BeatSpan } from "../schema/checks.ts";
import type { Storyboard } from "../schema/storyboard.ts";
import type { WarningPlace } from "./check-rows.ts";
import { counted } from "./labels.ts";
import { clockTime } from "./preview-time.ts";

/**
 * Every beat by scene, each with when it starts: the one playing is marked,
 * a click goes to it, and a beat the checks warned about carries the count.
 * A warning jumped to from the Checks tab is brought into sight and focused,
 * as the button that went there is hidden with its tab.
 */
export const PreviewBeats = ({
  storyboard,
  beats,
  current,
  warnings,
  warningsOutOfDate,
  revealed,
  seek,
  edit,
}: {
  storyboard: Storyboard;
  beats: readonly BeatSpan[];
  /** The beat playing, by id. */
  current: string | undefined;
  /** How many warnings the last checks found at each beat. */
  warnings: ReadonlyMap<string, number>;
  /** The files have changed since those checks. */
  warningsOutOfDate: boolean;
  /** The warning last jumped to: a new one each jump, even to the same place. */
  revealed: WarningPlace | undefined;
  seek: (t: number) => void;
  /** Where a beat is edited: the Script gate, at that beat. */
  edit: (beat: string) => string;
}) => {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!revealed) return;
    const button = list.current?.querySelector<HTMLElement>(
      `[data-beat="${CSS.escape(revealed.beat)}"]`,
    );
    button?.scrollIntoView({ block: "nearest" });
    button?.focus({ preventScroll: true });
  }, [revealed]);
  const startOf = new Map(beats.map((beat) => [beat.id, beat.start]));
  return (
    <div ref={list}>
      {storyboard.scenes.map((scene, s) => (
        <div key={scene.id} className="mt-3 first:mt-0">
          <h4 className="font-semibold text-muted text-sm">
            {s + 1} · {scene.title}
          </h4>
          <ol className="mt-1 divide-y divide-line" aria-label={`Beats of ${scene.title}`}>
            {scene.beats.map((beat, b) => {
              const startsAt = startOf.get(beat.id);
              const playing = current === beat.id;
              const warned = warnings.get(beat.id) ?? 0;
              return (
                <li key={beat.id} className="flex items-baseline">
                  <button
                    type="button"
                    aria-current={playing ? "step" : undefined}
                    data-beat={beat.id}
                    data-starts-at={startsAt}
                    className="grid min-w-0 flex-1 cursor-pointer grid-cols-[2rem_1fr_auto] items-baseline gap-2 px-2 py-2 text-left hover:bg-accent-soft aria-[current=step]:bg-accent-soft"
                    onClick={() => startsAt !== undefined && seek(startsAt)}
                  >
                    <span className="text-muted text-sm tabular-nums">{b + 1}</span>
                    <span>
                      <span className={playing ? "font-semibold text-accent" : "font-semibold"}>
                        {beat.caption}
                      </span>
                      {beat.say && <span className="block text-muted text-sm">{beat.say}</span>}
                    </span>
                    <span className="flex items-baseline gap-2 text-muted text-sm tabular-nums">
                      {warned > 0 && (
                        <span
                          className={warningsOutOfDate ? "text-muted" : "text-error"}
                          title={
                            warningsOutOfDate
                              ? "From checks the project has changed since"
                              : undefined
                          }
                        >
                          <span aria-hidden="true">▲ {warned}</span>
                          <span className="sr-only">
                            {counted(warned, "warning")}
                            {warningsOutOfDate ? ", from checks the project has changed since" : ""}
                          </span>
                        </span>
                      )}
                      {startsAt === undefined ? "" : clockTime(startsAt)}
                    </span>
                  </button>
                  <a
                    className="px-2 text-muted text-sm underline hover:text-ink"
                    href={edit(beat.id)}
                    aria-label={`Edit beat ${b + 1} of ${scene.title} in the script`}
                  >
                    Edit
                  </a>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
};
