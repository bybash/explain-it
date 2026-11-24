import type { ChecksRun, PreviewChecks } from "../schema/api.ts";
import type { checkRows, WarningPlace } from "./check-rows.ts";
import { counted, dateTimeLabel } from "./labels.ts";
import { clockTime } from "./preview-time.ts";

type CheckRows = ReturnType<typeof checkRows>;

/** Whether a run is under way: waiting for the sound or checking beats. */
const isRunning = (run: ChecksRun): boolean => run.state === "waiting" || run.state === "checking";

/** What the run is doing, in a line; nothing once it is done. */
const runLine = (run: ChecksRun): string => {
  switch (run.state) {
    case "idle":
    case "done":
      return "";
    case "waiting":
      return "Waiting for the voice and the music…";
    case "checking":
      return run.total === 0
        ? "Opening the video in Chrome…"
        : `Checking beat ${Math.min(run.checked + 1, run.total)} of ${run.total}…`;
    case "failed":
      return `The checks could not run: ${run.message}`;
  }
};

/** "Checked 23 Nov 2026, 10:00" in the viewer's own time zone. */
export const checkedLabel = (iso: string): string => `Checked ${dateTimeLabel(iso)}`;

/** The note an older report carries once the files have changed since. */
export const OutOfDate = ({ checks }: { checks: PreviewChecks }) =>
  checks.report && !checks.upToDate ? (
    <p className="mt-2 text-muted text-sm">
      The project has changed since these checks: run them again to check it as it is.
    </p>
  ) : null;

/** A warning's row: its mark, what it is with where, its words, and when it shows. */
const WarningLine = ({
  check,
  where,
  message,
  at,
}: {
  check: string;
  where: string;
  message: string;
  at?: number;
}) => (
  <>
    <span className="text-error" aria-hidden="true">
      ▲
    </span>
    <span>
      <span className="font-semibold">{check}</span>
      <span className="text-muted"> · {where}</span>
      <span className="block text-muted text-sm">{message}</span>
    </span>
    <span className="text-muted text-sm tabular-nums">{at === undefined ? "" : clockTime(at)}</span>
  </>
);

/** The grid every warning row shares. */
const ROW = "grid grid-cols-[2rem_1fr_auto] items-baseline gap-2 px-2 py-2";

/**
 * The Preview gate's Checks tab (SPEC, Checks): a button runs them, with
 * how far they are; then the whole video's warnings and the skipped checks,
 * and every warning at a beat, in the order they show. A click on one goes
 * to where it shows. Warnings never block a render.
 */
export const ChecksTab = ({
  checks,
  rows,
  problem,
  run,
  jump,
}: {
  checks: PreviewChecks | undefined;
  rows: CheckRows | undefined;
  problem: string | undefined;
  run: () => void;
  /** Goes to where a warning shows, in the beat list. */
  jump: (place: WarningPlace) => void;
}) => {
  const current = checks?.run ?? { state: "idle" };
  const report = checks?.report;
  const running = isRunning(current);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn px-4 py-1.5" onClick={run}>
          {running ? "Run again" : report ? "Run the checks again" : "Run the checks"}
        </button>
        <span
          role="status"
          className={
            current.state === "failed" || problem ? "text-error text-sm" : "text-muted text-sm"
          }
        >
          {problem ?? runLine(current)}
        </span>
        {current.state === "checking" && current.total > 0 && (
          <progress
            className="h-1.5 w-40 accent-accent"
            value={current.checked}
            max={current.total}
            aria-label="Beats checked"
          />
        )}
      </div>
      {!report && !running && (
        <p className="mt-3 text-muted text-sm">
          The checks look at every beat for overlaps, anything off the frame, captions too fast to
          read and narration that does not fit, and at the mix's loudness. They take about half a
          minute, and warn without stopping a render.
        </p>
      )}
      {checks && report && rows && (
        <>
          <OutOfDate checks={checks} />
          <p className="mt-3 text-muted text-sm">
            {checkedLabel(report.checkedAt)} · {report.beats} beats ·{" "}
            {report.warnings.length === 0
              ? "no warnings"
              : counted(report.warnings.length, "warning")}
          </p>
          {rows.skipped.length > 0 && (
            <ul className="mt-2 text-muted text-sm" aria-label="Checks skipped">
              {rows.skipped.map((skipped) => (
                <li key={skipped}>Skipped. {skipped}</li>
              ))}
            </ul>
          )}
          {rows.forVideo.length > 0 && (
            <ul className="mt-3 divide-y divide-line" aria-label="Warnings about the whole video">
              {rows.forVideo.map((warning) => (
                <li key={warning.message} className={ROW}>
                  <WarningLine
                    check={warning.check}
                    where="the whole video"
                    message={warning.message}
                  />
                </li>
              ))}
            </ul>
          )}
          {rows.atBeats.length > 0 && (
            <ol className="mt-3 divide-y divide-line" aria-label="Warnings at beats">
              {rows.atBeats.map((warning) => (
                // A beat's warning is told once, so its words and place name it.
                <li key={`${warning.beat}-${warning.at}-${warning.message}`}>
                  {warning.inScript ? (
                    <button
                      type="button"
                      data-beat={warning.beat}
                      data-at={warning.at}
                      className={`${ROW} w-full cursor-pointer text-left hover:bg-accent-soft`}
                      onClick={() => jump(warning)}
                    >
                      <WarningLine
                        check={warning.check}
                        where={`${warning.where} ${warning.caption}`}
                        message={warning.message}
                        at={warning.at}
                      />
                    </button>
                  ) : (
                    // The script has lost the beat since, so there is nowhere to go.
                    <div className={ROW}>
                      <WarningLine
                        check={warning.check}
                        where="a beat no longer in the script"
                        message={warning.message}
                        at={warning.at}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
};
