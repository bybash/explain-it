import { useEffect, useState } from "react";
import type { OpenedProject } from "../schema/api.ts";
import { DEFAULT_CONFIG, RESOLUTIONS, type Resolution, THEME_MODES } from "../schema/config.ts";
import type { RenderedFolder, RenderFile, RenderJob } from "../schema/render.ts";
import { renderFileUrl } from "./api.ts";
import { capitalised, dateTimeLabel, THEME_MODE_LABELS } from "./labels.ts";
import { clockTime } from "./preview-time.ts";
import { jobLine, jobsToShow, sizeLabel, themesOf } from "./render-rows.ts";
import { Pill } from "./ui.tsx";
import { useRenders } from "./useRenders.ts";

/** A theme to render: one, or both. */
type ThemeMode = (typeof THEME_MODES)[number];

/** How each of a render's files is named for download. */
const FILE_LABELS: Readonly<Record<RenderFile, string>> = {
  video: "Video with captions",
  clean: "Video without captions",
  captions: "Captions (.srt)",
  audio: "Soundtrack",
  poster: "Poster",
  contactSheet: "Contact sheet",
};

const CARD = "rounded-box border border-line bg-surface p-4";

/** A finished render: each theme's video to play, and every file to download with its size. */
const FinishedRender = ({ slug, render }: { slug: string; render: RenderedFolder }) => (
  <article className={CARD} aria-label={`Render of ${dateTimeLabel(render.createdAt)}`}>
    <h4 className="font-semibold">
      {dateTimeLabel(render.createdAt)}
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
                    download
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
 * A render queued or running: what it is doing, a bar (moving while it
 * speaks or mixes, then filling with its frames), and Cancel. Its controls
 * name it by the time it was asked for, as several can be listed.
 */
const LiveJob = ({
  job,
  announced,
  cancel,
}: {
  job: RenderJob;
  announced: boolean;
  cancel: () => void;
}) => {
  const asked = dateTimeLabel(job.createdAt);
  const framing = job.state === "running" && job.step?.step === "frames" && job.progress;
  return (
    <li className="flex flex-wrap items-center gap-3 py-2" data-job={job.id}>
      <span className="font-semibold">{capitalised(job.state)}</span>
      <span className="text-muted text-sm" {...(announced ? { role: "status" } : {})}>
        {jobLine(job)}
      </span>
      {job.state === "running" && (
        <progress
          className="h-1.5 w-40 accent-accent"
          max={100}
          // Without a value the bar moves on its own: the voice and the mix have no frames to count.
          {...(framing ? { value: job.progress?.percent ?? 0 } : {})}
          aria-label={`Progress of the render asked for ${asked}`}
        />
      )}
      <Pill
        className="ml-auto"
        onClick={cancel}
        aria-label={`Cancel the render asked for ${asked}`}
      >
        Cancel
      </Pill>
    </li>
  );
};

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
  // A style saved since (in another tab, or over MCP) presets the form again.
  useEffect(() => setTheme(config.theme.mode), [config.theme.mode]);
  useEffect(() => setResolution(config.output.resolution), [config.output.resolution]);
  const { view, problem, render, cancel } = useRenders(slug);
  const jobs = view ? jobsToShow(view) : [];
  const renders = view?.renders ?? [];
  const live = jobs.filter((job) => job.state === "running" || job.state === "queued");
  const ended = jobs.filter((job) => !live.includes(job));

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
                  {THEME_MODE_LABELS[mode]}
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
            Render
          </button>
        </form>
        <p className="mt-3 text-muted text-sm">
          The style's theme and resolution are chosen; changing them here does not change the style.
          {live.length > 0 && " A new render starts when the one under way is done."}
        </p>
        {problem && <p className="mt-2 text-error text-sm">{problem}</p>}
      </section>

      {live.length > 0 && (
        <section className={CARD} aria-labelledby="render-jobs-heading">
          <h3 id="render-jobs-heading" className="mb-1 font-bold text-base">
            Renders under way
          </h3>
          <ul className="divide-y divide-line" aria-label="Render jobs">
            {live.map((job, i) => (
              <LiveJob
                key={job.id}
                job={job}
                // Only the first is running; its line alone is announced as it moves on.
                announced={i === 0}
                cancel={() => cancel(job.id)}
              />
            ))}
          </ul>
        </section>
      )}

      {ended.length > 0 && (
        <section className={CARD} aria-labelledby="render-ended-heading">
          <h3 id="render-ended-heading" className="mb-1 font-bold text-base">
            Renders that did not finish
          </h3>
          <ul className="divide-y divide-line" aria-label="Renders that did not finish">
            {ended.map((job) => (
              <li key={job.id} className="flex flex-wrap items-baseline gap-3 py-2">
                <span className="text-muted text-sm">{dateTimeLabel(job.createdAt)}</span>
                <span
                  className={job.state === "failed" ? "text-error text-sm" : "text-muted text-sm"}
                >
                  {jobLine(job)}
                </span>
              </li>
            ))}
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
