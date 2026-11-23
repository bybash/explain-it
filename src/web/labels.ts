import type { Gate } from "../schema/project.ts";

/** How each gate is named in the app (SPEC, User flow). */
export const GATE_LABELS: Readonly<Record<Gate, string>> = {
  graph: "Graph",
  script: "Script",
  style: "Style",
  preview: "Preview",
  render: "Render",
};

/** What each gate's panel shows (SPEC, User flow), until the panels themselves arrive. */
export const GATE_PANELS: Readonly<Record<Gate, string>> = {
  graph: "The flow as Mermaid code and its diagram, to edit directly.",
  script: "The scenes and beats: captions, narration and actions.",
  style: "Palette, font, voice, captions, music and output.",
  preview: "The player with a scrubber, the beat list, check warnings and the contact sheet.",
  render: "Render progress, then the downloads.",
};

/** "Updated 20 Nov 2026, 10:00" in the viewer's own time zone. */
export const updatedLabel = (iso: string): string =>
  `Updated ${new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`;
