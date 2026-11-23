import type { ChecksRun, PreviewChecks } from "../schema/api.ts";
import { contactSheetUrl } from "./api.ts";
import type { checkRows } from "./check-rows.ts";
import { clockTime } from "./preview-time.ts";

type Rows = ReturnType<typeof checkRows>;

/** Whether a run is under way: waiting for the sound or checking beats. */
export const running = (run: ChecksRun): boolean =>
  run.state === "waiting" || run.state === "checking";

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
const checkedLabel = (iso: string): string =>
  `Checked ${new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`;

/** The note an older report carries once the files have changed since. */
const OutOfDate = ({ checks }: { checks: PreviewChecks }) =>
  checks.report && !checks.upToDate ? (
    <p className="mt-2 text-muted text-sm">
      The project has changed since these checks: run them again to check it as it is.
    </p>
  ) : null;

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
  rows: Rows | undefined;
  problem: string | undefined;
  run: () => void;
  /** Goes to the moment a warning shows, at its beat. */
  jump: (at: number, beat: string) => void;
}) => {
  const now = checks?.run ?? { state: "idle" };
  const report = checks?.report;
  const busy = running(now);
  const line = problem ?? runLine(now);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn px-4 py-1.5" onClick={run}>
          {busy ? "Run again" : report ? "Run the checks again" : "Run the checks"}
        </button>
        <span
          role="status"
          className={
            now.state === "failed" || problem ? "text-error text-sm" : "text-muted text-sm"
          }
        >
          {line}
        </span>
        {now.state === "checking" && now.total > 0 && (
          <progress
            className="h-1.5 w-40 accent-accent"
            value={now.checked}
            max={now.total}
            aria-label="Beats checked"
          />
        )}
      </div>
      {!report && !busy && (
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
              : `${report.warnings.length} ${report.warnings.length === 1 ? "warning" : "warnings"}`}
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
                <li
                  key={warning.message}
                  className="grid grid-cols-[2rem_1fr] items-baseline gap-2 px-2 py-2"
                >
                  <span className="text-error" aria-hidden="true">
                    ▲
                  </span>
                  <span>
                    <span className="font-semibold">{warning.check}</span> · the whole video
                    <span className="block text-muted text-sm">{warning.message}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {rows.atBeats.length > 0 && (
            <ol className="mt-3 divide-y divide-line" aria-label="Warnings at beats">
              {rows.atBeats.map((warning) => (
                // A beat's warning is told once, so its words and place name it.
                <li key={`${warning.beat}-${warning.at}-${warning.message}`}>
                  <button
                    type="button"
                    data-beat={warning.beat}
                    data-at={warning.at}
                    className="grid w-full cursor-pointer grid-cols-[2rem_1fr_auto] items-baseline gap-2 px-2 py-2 text-left hover:bg-accent-soft"
                    onClick={() => jump(warning.at, warning.beat)}
                  >
                    <span className="text-error" aria-hidden="true">
                      ▲
                    </span>
                    <span>
                      <span className="font-semibold">{warning.check}</span>
                      {warning.where && (
                        <span className="text-muted">
                          {" "}
                          · {warning.where} {warning.caption}
                        </span>
                      )}
                      <span className="block text-muted text-sm">{warning.message}</span>
                    </span>
                    <span className="text-muted text-sm tabular-nums">{clockTime(warning.at)}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
};

/** The contact sheet: one still per beat at its midpoint, the beats with warnings outlined in red. */
export const ContactSheet = ({
  slug,
  checks,
}: {
  slug: string;
  checks: PreviewChecks | undefined;
}) => {
  const report = checks?.report;
  if (!report?.contactSheet)
    return (
      <p className="text-muted text-sm">
        {report
          ? "These checks drew no contact sheet: the layout checks were skipped."
          : "The checks draw a contact sheet: run them from the Checks tab."}
      </p>
    );
  const full = contactSheetUrl(slug, report.contactSheet.full, report.checkedAt);
  return (
    <div>
      {checks && <OutOfDate checks={checks} />}
      <a href={full} target="_blank" rel="noreferrer" className="mt-2 block">
        <img
          src={full}
          alt="The contact sheet: a still of every beat, those with warnings outlined in red"
          className="w-full rounded-box border border-line"
        />
      </a>
      <p className="mt-2 text-muted text-sm">
        {checkedLabel(report.checkedAt)}. Open it full size in a new tab with a click.
      </p>
    </div>
  );
};
