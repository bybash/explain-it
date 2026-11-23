import type { PreviewChecks } from "../schema/api.ts";
import { contactSheetUrl } from "./api.ts";
import { checkedLabel, OutOfDate } from "./ChecksTab.tsx";

/**
 * The Preview gate's Contact sheet tab: one still per beat at its midpoint,
 * the beats with warnings outlined in red. The small sheet is shown; a click
 * opens the full-size one.
 */
export const ContactSheet = ({
  slug,
  checks,
}: {
  slug: string;
  checks: PreviewChecks | undefined;
}) => {
  const report = checks?.report;
  if (!checks || !report?.contactSheet)
    return (
      <p className="text-muted text-sm">
        {report
          ? "These checks drew no contact sheet: the layout checks were skipped."
          : "The checks draw a contact sheet: run them from the Checks tab."}
      </p>
    );
  const sheet = (file: string) => contactSheetUrl(slug, file, report.checkedAt);
  return (
    <div>
      <OutOfDate checks={checks} />
      <a
        href={sheet(report.contactSheet.full)}
        target="_blank"
        rel="noreferrer"
        className="mt-2 block"
      >
        <img
          src={sheet(report.contactSheet.small)}
          alt="The contact sheet: a still of every beat, those with warnings outlined in red"
          className="w-full rounded-box border border-line"
        />
      </a>
      <p className="mt-2 text-muted text-sm">
        {checkedLabel(report.checkedAt)}. A click opens it full size in a new tab.
      </p>
    </div>
  );
};
