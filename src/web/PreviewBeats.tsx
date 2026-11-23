import type { BeatSpan } from "../schema/checks.ts";
import type { Storyboard } from "../schema/storyboard.ts";
import { clockTime } from "./preview-time.ts";

/**
 * Every beat by scene, each with when it starts: the one playing is marked,
 * a click goes to it, and a beat the checks warned about carries the count.
 */
export const PreviewBeats = ({
  storyboard,
  beats,
  current,
  warnings,
  seek,
}: {
  storyboard: Storyboard;
  beats: readonly BeatSpan[];
  /** The beat playing, by id. */
  current: string | undefined;
  /** How many warnings the last checks found at each beat. */
  warnings: ReadonlyMap<string, number>;
  seek: (t: number) => void;
}) => {
  const startOf = new Map(beats.map((beat) => [beat.id, beat.start]));
  return storyboard.scenes.map((scene, s) => (
    <div key={scene.id} className="mt-3 first:mt-0">
      <h4 className="font-semibold text-muted text-sm">
        {s + 1} · {scene.title}
      </h4>
      <ol className="mt-1 divide-y divide-line" aria-label={`Beats of ${scene.title}`}>
        {scene.beats.map((beat, b) => {
          const startsAt = startOf.get(beat.id);
          const now = current === beat.id;
          const warned = warnings.get(beat.id) ?? 0;
          return (
            <li key={beat.id}>
              <button
                type="button"
                aria-current={now ? "step" : undefined}
                data-beat={beat.id}
                data-starts-at={startsAt}
                className="grid w-full cursor-pointer grid-cols-[2rem_1fr_auto] items-baseline gap-2 px-2 py-2 text-left hover:bg-accent-soft aria-[current=step]:bg-accent-soft"
                onClick={() => startsAt !== undefined && seek(startsAt)}
              >
                <span className="text-muted text-sm tabular-nums">{b + 1}</span>
                <span>
                  <span className={now ? "font-semibold text-accent" : "font-semibold"}>
                    {beat.caption}
                  </span>
                  {beat.say && <span className="block text-muted text-sm">{beat.say}</span>}
                </span>
                <span className="flex items-baseline gap-2 text-muted text-sm tabular-nums">
                  {warned > 0 && (
                    <span className="text-error">
                      ▲ {warned}
                      <span className="sr-only"> {warned === 1 ? "warning" : "warnings"}</span>
                    </span>
                  )}
                  {startsAt === undefined ? "" : clockTime(startsAt)}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  ));
};
