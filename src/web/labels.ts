import type { Angle, CaptionPlace, THEME_MODES } from "../schema/config.ts";
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
  graph: "The flow as a diagram, or as the Mermaid code it is drawn from, to edit directly.",
  script: "The story, then its scenes and beats: captions, narration and actions.",
  style:
    "How the video looks and sounds. Changes show in the preview straight away; the voice and the music have samples to listen to.",
  preview:
    "The video with its voice and music, as the render will make it. The voice is made when the gate opens; until then the video plays silently. The checks warn about anything that overlaps, leaves the frame, reads too fast or sounds too loud.",
  render:
    "The video rendered as MP4, each theme with and without its captions, with the .srt, the soundtrack, a poster and the contact sheet to download.",
};

/** "20 Nov 2026, 10:00" in the viewer's own time zone. */
export const dateTimeLabel = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/** "Updated 20 Nov 2026, 10:00". */
export const updatedLabel = (iso: string): string => `Updated ${dateTimeLabel(iso)}`;

/** How each theme choice reads, at the style gate and the render gate. */
export const THEME_MODE_LABELS: Readonly<Record<(typeof THEME_MODES)[number], string>> = {
  light: "Light",
  dark: "Dark",
  both: "Both (two videos)",
};

/** A name as a label shows it: "ocean" as "Ocean". */
export const capitalised = (name: string): string => name.charAt(0).toUpperCase() + name.slice(1);

/** "1 warning", "3 warnings": a count with its noun. */
export const counted = (n: number, one: string, many = `${one}s`): string =>
  `${n} ${n === 1 ? one : many}`;

/** What each angle is for, as the Look tab offers it (decision 047). */
export const ANGLE_LABELS: Readonly<Record<Angle, string>> = {
  isometric: "Isometric",
  wide: "Wide: flatter, fills a 16:9 frame",
  high: "High: deeper, for a tall layout",
};

/** Where the scene title and the step captions go, as the Captions card offers it (decision 049). */
export const CAPTION_PLACE_LABELS: Readonly<Record<CaptionPlace, string>> = {
  top: "At the top",
  bottom: "Bottom left",
};
