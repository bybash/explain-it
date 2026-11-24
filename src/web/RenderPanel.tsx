import { useState } from "react";
import type { OpenedProject } from "../schema/api.ts";
import { DEFAULT_CONFIG, RESOLUTIONS, type Resolution, THEME_MODES } from "../schema/config.ts";
import type { RenderedFolder, RenderFile } from "../schema/render.ts";
import { renderFileUrl } from "./api.ts";
import { capitalised } from "./labels.ts";
import { clockTime } from "./preview-time.ts";
import { jobLine, jobsToShow, sizeLabel, themesOf } from "./render-rows.ts";
import { useRenders } from "./useRenders.ts";

/** A theme to render: one, or both. */
type ThemeMode = (typeof THEME_MODES)[number];

/** How each theme choice reads in the form. */
const THEME_LABELS: Readonly<Record<ThemeMode, string>> = {
  light: "Light",
  dark: "Dark",
  both: "Light and dark",
};

/** How each of a render's files is named for download. */
const FILE_LABELS: Readonly<Record<RenderFile, string>> = {
  video: "Video with captions",
  clean: "Video without captions",
  captions: "Captions (.srt)",
  audio: "Soundtrack",
  poster: "Poster",
  contactSheet: "Contact sheet",
};

/** "23 Nov 2026, 22:40" in the viewer's own time zone. */
const whenLabel = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

const CARD = "rounded-box border border-line bg-surface p-4";

/** A finished render: each theme's video to play, and every file to download with its size. */
const FinishedRender = ({ slug, render }: { slug: string; render: RenderedFolder }) => (
  <article className={CARD} aria-label={`Render of ${whenLabel(render.createdAt)}`}>
    <h4 className="font-semibold">
      {whenLabel(render.createdAt)}
      <span className="font-normal text-muted text-sm">
        {" "}
        · {render.resolution} · {clockTime(render.seconds)}
      </span>
    </h4>
    {themesOf(render).map(({ theme, files }) => {
      const named = (file: RenderFile) => files.find((f) => f.file === file);
      const video = named("video");
      const poster = named("poster");
      const where = (name: string) => ({ stamp: render.stamp, theme, name });
      return (
        <div key={theme} className="mt-3 grid gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          {video ? (
            <video
              controls
              preload="metadata"
              aria-label={`The ${theme} video`}
              src={renderFileUrl(slug, where(video.name))}
              {...(poster ? { poster: renderFileUrl(slug, where(poster.name)) } : {})}
              className="aspect-video w-full rounded-box border border-line bg-page"
            />
          ) : (
            <p className="text-muted text-sm">The video is missing from this render's folder.</p>
          )}
          <div>
            <h5 className="font-semibold text-muted text-sm">{capitalised(theme)}</h5>
            <ul className="mt-1 divide-y divide-line" aria-label={`Files of the ${theme} video`}>
              {files.map((file) => (
                <li key={file.file} className="flex items-baseline justify-between gap-3 py-1.5">
                  <a
                    className="underline"
                    href={renderFileUrl(slug, where(file.name), true)}
                    download={`${slug}-${theme}-${file.name}`}
                  >
                    {FILE_LABELS[file.file]}
                  </a>
                  <span className="text-muted text-sm tabular-nums">{sizeLabel(file.bytes)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      );
    })}
  </article>
);

/**
 * The Render gate's panel (SPEC, Rendering): render the video with the
 * style's theme and resolution, or others chosen here (the style is not
 * changed); follow the render step by step, and cancel it; then play each
 * finished render and download its files. Renders run one at a time.
 */
export const RenderPanel = ({ opened }: { opened: OpenedProject }) => {
  const { slug } = opened;
  const config = opened.config ?? DEFAULT_CONFIG;
  const [theme, setTheme] = useState<ThemeMode>(config.theme.mode);
  const [resolution, setResolution] = useState<Resolution>(config.output.resolution);
  const { view, problem, render, cancel } = useRenders(slug);
  const jobs = view ? jobsToShow(view) : [];
  const renders = view?.renders ?? [];
  const busy = jobs.some((job) => job.state === "running" || job.state === "queued");

  return (
    <div className="mt-3 mb-2 flex flex-col gap-6">
      <section className={CARD} aria-labelledby="render-form-heading">
        <h3 id="render-form-heading" className="mb-3 font-bold text-base">
          New render
        </h3>
        <form
          className="flex flex-wrap items-end gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            render({ theme, resolution });
          }}
        >
          <label className="flex flex-col gap-1 text-sm">
            Theme
            <select
              className="field"
              value={theme}
              onChange={(e) => setTheme(e.target.value as ThemeMode)}
            >
              {THEME_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {THEME_LABELS[mode]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Resolution
            <select
              className="field"
              value={resolution}
              onChange={(e) => setResolution(e.target.value as Resolution)}
            >
              {RESOLUTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn px-4 py-1.5">
            {busy ? "Render after this one" : "Render"}
          </button>
        </form>
        <p className="mt-3 text-muted text-sm">
          The style's theme and resolution are chosen; changing them here does not change the style.
          A render takes about a minute a theme for the example, after the voice.
        </p>
        {problem && <p className="mt-2 text-error text-sm">{problem}</p>}
      </section>

      {jobs.length > 0 && (
        <section className={CARD} aria-labelledby="render-jobs-heading">
          <h3 id="render-jobs-heading" className="mb-1 font-bold text-base">
            Renders under way
          </h3>
          <ul className="divide-y divide-line" aria-label="Render jobs">
            {jobs.map((job) => {
              const ended = job.state === "failed" || job.state === "cancelled";
              const percent = job.state === "running" ? (job.progress?.percent ?? 0) : undefined;
              return (
                <li
                  key={job.id}
                  className="flex flex-wrap items-center gap-3 py-2"
                  data-job={job.id}
                >
                  <span className="font-semibold">{capitalised(job.state)}</span>
                  <span
                    role="status"
                    className={job.state === "failed" ? "text-error text-sm" : "text-muted text-sm"}
                  >
                    {jobLine(job)}
                  </span>
                  {percent !== undefined && (
                    <progress
                      className="h-1.5 w-40 accent-accent"
                      value={percent}
                      max={100}
                      aria-label="Render progress"
                    />
                  )}
                  {!ended && (
                    <button
                      type="button"
                      className="ml-auto rounded-full border border-line px-3 py-1 text-sm hover:border-accent"
                      onClick={() => cancel(job.id)}
                    >
                      Cancel
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="renders-heading">
        <h3 id="renders-heading" className="mb-3 font-bold text-base">
          Finished renders
        </h3>
        {!view ? (
          <p className="text-muted text-sm">Reading the renders…</p>
        ) : renders.length === 0 ? (
          <p className="text-muted text-sm">
            No renders yet: the first one shows here when it is done.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {renders.map((r) => (
              <FinishedRender key={r.stamp} slug={slug} render={r} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
