import type { Gate } from "../schema/project.ts";

/** How each gate is named in the app (SPEC, User flow). */
export const GATE_LABELS: Readonly<Record<Gate, string>> = {
  graph: "Graph",
  script: "Script",
  style: "Style",
  preview: "Preview",
  render: "Render",
};

/** "Updated 20 Nov 2026, 10:00" in the viewer's own time zone. */
export const updatedLabel = (iso: string): string =>
  `Updated ${new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`;
