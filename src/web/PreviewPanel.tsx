import { useCallback, useEffect, useRef, useState } from "react";
import type { OpenedProject, PreviewSound } from "../schema/api.ts";
import { DEFAULT_CONFIG, type LogoImages } from "../schema/config.ts";
import { formatErrors } from "../schema/errors.ts";
import {
  getLogo,
  getPreviewSound,
  onServerEvents,
  previewSoundUrl,
  startPreviewSound,
} from "./api.ts";
import { ChecksTab, ContactSheet } from "./ChecksTab.tsx";
import { checkRows } from "./check-rows.ts";
import { PreviewBeats } from "./PreviewBeats.tsx";
import { beatAt, clockTime } from "./preview-time.ts";
import { Pill, Tabs } from "./ui.tsx";
import { usePreviewChecks } from "./usePreviewChecks.ts";
import { usePreviewFrame } from "./usePreviewFrame.ts";

/** The tabs under the player. */
type PanelTab = "beats" | "checks" | "sheet";
const NO_WARNINGS: ReadonlyMap<string, number> = new Map();

/** How long the first line may take before the panel says the model may be downloading. */
const SLOW_START_MS = 3000;

/** What the voice and the mix are doing, in a line. */
const soundLine = (sound: PreviewSound, voiced: boolean): string => {
  switch (sound.state) {
    case "idle":
      return "Getting the sound ready…";
    case "speaking":
      return sound.total === 0
        ? "Getting the voice ready…"
        : // The line being spoken is the one after those done.
          `Speaking line ${Math.min(sound.spoken + 1, sound.total)} of ${sound.total}…`;
    case "mixing":
      return "Mixing the soundtrack…";
    case "ready":
      return voiced ? "The voice and the music are ready." : "The music is ready.";
    case "silent":
      return "This video has no voice and no music.";
    case "failed":
      return `The sound could not be made: ${sound.message}`;
  }
};

/**
 * The preview gate's panel (SPEC, User flow): the video with its sound, as
 * the render will make it. Opening it starts the voice for every line not
 * spoken yet, then the soundtrack's mix; until both are done the video plays
 * silently with estimated timing. Below, every beat by scene: the one
 * playing is marked, and a click goes to it.
 */
export const PreviewPanel = ({ opened }: { opened: OpenedProject }) => {
  const { slug, storyboard } = opened;
  const config = opened.config ?? DEFAULT_CONFIG;
  const [sound, setSound] = useState<PreviewSound>({ state: "idle" });
  const [soundErrors, setSoundErrors] = useState<string | undefined>();
  const [logo, setLogo] = useState<LogoImages | undefined>();
  const [darkShown, setDarkShown] = useState(false);
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [tab, setTab] = useState<PanelTab>("beats");
  const audio = useRef<HTMLAudioElement>(null);
  /** When the silent clock read 0 s, so a seek while playing moves it. */
  const clockZero = useRef(0);
  /** No line has come for a while: the first time, the voice model is downloading. */
  const [slowStart, setSlowStart] = useState(false);
  const mode = config.theme.mode === "both" ? (darkShown ? "dark" : "light") : config.theme.mode;
  const narration = sound.state === "ready" ? sound.narration : undefined;
  const preview = usePreviewFrame({ opened, config, mode, logo, narration });
  const { duration, beats } = preview;

  const start = useCallback(async () => {
    const started = await startPreviewSound(slug);
    if (started.ok) {
      setSound(started.value);
      setSoundErrors(undefined);
    } else setSoundErrors(formatErrors(started.errors).join("; "));
  }, [slug]);

  // Opening the gate, and any change to the project's files, asks for the sound: the server
  // answers at once when nothing changed, and speaks only the lines that did.
  const projectFiles = JSON.stringify([
    opened.graph,
    opened.storyboard,
    opened.layout,
    opened.config,
  ]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `projectFiles` stands for the files.
  useEffect(() => {
    void start();
  }, [start, projectFiles]);
  const checks = usePreviewChecks(slug, projectFiles);

  const waitingForFirstLine = sound.state === "speaking" && sound.spoken === 0;
  useEffect(() => {
    setSlowStart(false);
    if (!waitingForFirstLine) return;
    const timer = setTimeout(() => setSlowStart(true), SLOW_START_MS);
    return () => clearTimeout(timer);
  }, [waitingForFirstLine]);

  useEffect(
    () =>
      onServerEvents({
        connected: () => void start(),
        event: (event) => {
          if (event.type !== "preview-sound" || event.slug !== slug) return;
          void getPreviewSound(slug).then((now) => now.ok && setSound(now.value));
        },
      }),
    [slug, start],
  );

  // A logo saved in another tab arrives with the project's files.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `projectFiles` stands for the files.
  useEffect(() => {
    void getLogo(slug).then((result) => {
      if (result.ok) setLogo(result.value.logo ?? undefined);
    });
  }, [slug, projectFiles]);

  const seek = (t: number) => {
    const to = Math.max(0, Math.min(t, duration));
    setAt(to);
    preview.seek(to);
    if (audio.current) audio.current.currentTime = to;
    clockZero.current = performance.now() - to * 1000;
  };

  // While playing, the picture follows the soundtrack's clock, or a clock of its own when silent.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `preview.seek` only posts to the iframe.
  useEffect(() => {
    if (!playing) return;
    const sounding = audio.current && sound.state === "ready" ? audio.current : undefined;
    // Play at the end starts again from the beginning.
    const from = at >= duration - 0.05 ? 0 : at;
    clockZero.current = performance.now() - from * 1000;
    if (sounding) {
      sounding.currentTime = from;
      void sounding.play().catch(() => setPlaying(false));
    }
    let frame = requestAnimationFrame(function tick() {
      const t = sounding ? sounding.currentTime : (performance.now() - clockZero.current) / 1000;
      if (t >= duration || sounding?.ended) {
        setPlaying(false);
        return;
      }
      setAt(t);
      preview.seek(t);
      frame = requestAnimationFrame(tick);
    });
    return () => {
      cancelAnimationFrame(frame);
      sounding?.pause();
    };
  }, [playing, sound.state, duration]);

  if (!preview.ready || !storyboard)
    return (
      <p className="my-4 text-muted">The preview needs the graph, the script and the layout.</p>
    );

  const current = beatAt(beats, at);
  const report = checks.checks?.report;
  const rows = report ? checkRows(report, storyboard) : undefined;
  const warningCount = report?.warnings.length ?? 0;
  /** Goes to where a warning shows, in the beat list, with that beat in sight. */
  const jump = (t: number, beat: string) => {
    seek(t);
    setTab("beats");
    requestAnimationFrame(() =>
      document.querySelector(`[data-beat="${CSS.escape(beat)}"][data-starts-at]`)?.scrollIntoView({
        block: "nearest",
      }),
    );
  };
  const busy = sound.state === "speaking" || sound.state === "mixing" || sound.state === "idle";

  return (
    <div className="mt-3 mb-2 flex flex-col gap-6">
      <section
        className="rounded-box border border-line bg-surface p-4"
        aria-labelledby="preview-player-heading"
      >
        <h3 id="preview-player-heading" className="mb-3 font-bold text-base">
          Player
        </h3>
        <iframe
          {...preview.frameProps}
          title="The video"
          className="aspect-video w-full rounded-box border border-line bg-surface"
        />
        {preview.problem && <p className="mt-2 text-error text-sm">{preview.problem}</p>}
        {sound.state === "ready" && (
          // biome-ignore lint/a11y/useMediaCaption: the narration is drawn as captions in the video itself.
          <audio ref={audio} src={previewSoundUrl(slug, sound.key)} preload="auto" />
        )}
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            className="btn px-4 py-1.5"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? "❚❚" : "▶"}
          </button>
          <input
            type="range"
            className="flex-1 accent-accent"
            min={0}
            max={duration}
            step={0.1}
            value={Math.min(at, duration)}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label="Time in the video"
          />
          <span className="text-muted text-sm tabular-nums">
            {clockTime(at)} / {clockTime(duration)}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm" role="status">
          <span className={sound.state === "failed" ? "text-error" : "text-muted"}>
            {soundErrors ?? soundLine(sound, config.voice.enabled)}
          </span>
          {sound.state === "speaking" && sound.total > 0 && (
            <progress
              className="h-1.5 w-40 accent-accent"
              value={sound.spoken}
              max={sound.total}
              aria-label="Lines spoken"
            />
          )}
          {sound.state === "failed" && <Pill onClick={() => void start()}>Try again</Pill>}
          {busy && (
            <span className="text-muted">
              Until then the video plays silently, with its timing estimated
              {slowStart
                ? "; the first time, the voice model downloads, which takes a minute or two"
                : ""}
              .
            </span>
          )}
          {config.theme.mode === "both" && (
            <label className="ml-auto flex items-center gap-2 text-muted">
              <input
                type="checkbox"
                checked={darkShown}
                onChange={(e) => setDarkShown(e.target.checked)}
              />
              Show the dark video
            </label>
          )}
        </div>
      </section>

      <section
        className="rounded-box border border-line bg-surface p-4"
        aria-label="Beats and checks"
      >
        <Tabs
          label="Beats and checks"
          selected={tab}
          select={setTab}
          tabs={[
            {
              id: "beats",
              label: "Beats",
              content: (
                <PreviewBeats
                  storyboard={storyboard}
                  beats={beats}
                  current={current?.id}
                  warnings={rows?.countByBeat ?? NO_WARNINGS}
                  seek={seek}
                />
              ),
            },
            {
              id: "checks",
              label: warningCount > 0 ? `Checks (${warningCount})` : "Checks",
              content: (
                <ChecksTab
                  checks={checks.checks}
                  rows={rows}
                  problem={checks.problem}
                  run={checks.run}
                  jump={jump}
                />
              ),
            },
            {
              id: "sheet",
              label: "Contact sheet",
              content: <ContactSheet slug={slug} checks={checks.checks} />,
            },
          ]}
        />
      </section>
    </div>
  );
};
