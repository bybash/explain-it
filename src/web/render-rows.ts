import type { RendersView } from "../schema/api.ts";
import type { RenderedFolder, RenderJob } from "../schema/render.ts";

/** What a render job is doing, or how it ended when it did not finish, in a line. */
export const jobLine = (job: RenderJob): string => {
  switch (job.state) {
    case "queued":
      return "Waiting for the render before it…";
    case "failed":
      return `The render failed: ${job.error ?? "no reason was given"}`;
    case "cancelled":
      return "Cancelled.";
    case "done":
      return "Done.";
    case "running":
      break;
  }
  switch (job.step?.step) {
    case undefined:
      return "Starting…";
    case "voice":
      return `Speaking line ${Math.min(job.step.spoken + 1, job.step.total)} of ${job.step.total}…`;
    case "mix":
      return "Mixing the voice and the music…";
    case "frames":
      return job.progress
        ? `Capturing the ${job.progress.theme} video: frame ${job.progress.done} of ${job.progress.total}`
        : "Opening the video in Chrome…";
    case "finishing":
      return "Writing the poster, the captions and the contact sheet…";
  }
};

/**
 * The jobs the Render gate shows: those queued or running, and those that
 * failed or were cancelled. A finished job is left out once its render is
 * listed from disk, so a render shows once.
 */
export const jobsToShow = (view: RendersView): RenderJob[] => {
  const listed = new Set(view.renders.map((render) => render.stamp));
  return view.jobs.filter(
    (job) => job.state !== "done" || job.stamp === undefined || !listed.has(job.stamp),
  );
};

/** A render's files by theme, in the order it rendered them. */
export const themesOf = (render: RenderedFolder) =>
  render.themes.map((theme) => ({
    theme,
    files: render.files.filter((file) => file.theme === theme),
  }));

/** A file's size as people read it: "640 bytes", "56 KB", "4.8 MB". */
export const sizeLabel = (bytes: number): string => {
  if (bytes < 1000) return `${bytes} bytes`;
  if (bytes < 1_000_000) return `${Math.round(bytes / 1000)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
};
