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
import { beatAt, clockTime } from "./preview-time.ts";
import { Pill } from "./ui.tsx";
import { usePreviewFrame } from "./usePreviewFrame.ts";

/** What the voice and the mix are doing, in a line. */
const soundLine = (sound: PreviewSound, voiced: boolean): string => {
  switch (sound.state) {
    case "idle":
      return "Getting the sound ready…";
    case "speaking":
      return sound.total === 0
        ? "Getting the voice ready…"
        : `Speaking line ${sound.spoken} of ${sound.total}…`;
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
  const audio = useRef<HTMLAudioElement>(null);
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
  const files = JSON.stringify([opened.graph, opened.storyboard, opened.layout, opened.config]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `files` stands for the project's files.
  useEffect(() => {
    void start();
  }, [start, files]);

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

  useEffect(() => {
    void getLogo(slug).then((result) => {
      if (result.ok) setLogo(result.value.logo ?? undefined);
    });
  }, [slug]);

  const seek = (t: number) => {
    const to = Math.max(0, Math.min(t, duration));
    setAt(to);
    preview.seek(to);
    if (audio.current) audio.current.currentTime = to;
  };

  // While playing, the picture follows the soundtrack's clock, or a clock of its own when silent.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `preview.seek` only posts to the iframe.
  useEffect(() => {
    if (!playing) return;
    const sounding = audio.current && sound.state === "ready" ? audio.current : undefined;
    const from = performance.now() - at * 1000;
    if (sounding) {
      sounding.currentTime = at;
      void sounding.play().catch(() => setPlaying(false));
    }
    let frame = requestAnimationFrame(function tick() {
      const t = sounding ? sounding.currentTime : (performance.now() - from) / 1000;
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
  const startOf = new Map(beats.map((beat) => [beat.id, beat.start]));
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
              {sound.state === "speaking" && sound.spoken === 0
                ? "; the first time also downloads the voice model, a minute or two"
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
        aria-labelledby="preview-beats-heading"
      >
        <h3 id="preview-beats-heading" className="mb-1 font-bold text-base">
          Beats
        </h3>
        {storyboard.scenes.map((scene, s) => (
          <div key={scene.id} className="mt-3">
            <h4 className="font-semibold text-muted text-sm">
              {s + 1} · {scene.title}
            </h4>
            <ol className="mt-1 divide-y divide-line" aria-label={`Beats of ${scene.title}`}>
              {scene.beats.map((beat, b) => {
                const startsAt = startOf.get(beat.id);
                const now = current?.id === beat.id;
                return (
                  <li key={beat.id}>
                    <button
                      type="button"
                      aria-current={now ? "step" : undefined}
                      className="grid w-full cursor-pointer grid-cols-[2rem_1fr_auto] items-baseline gap-2 px-2 py-2 text-left hover:bg-accent-soft aria-[current=step]:bg-accent-soft"
                      onClick={() => startsAt !== undefined && seek(startsAt)}
                    >
                      <span className="text-muted text-sm tabular-nums">{b + 1}</span>
                      <span>
                        <span className={now ? "font-semibold text-accent" : "font-semibold"}>
                          {beat.caption}
                        </span>
                        {beat.say && <span className="block text-muted text-sm">{beat.say}</span>}
                      </span>
                      <span className="text-muted text-sm tabular-nums">
                        {startsAt === undefined ? "" : clockTime(startsAt)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </section>
    </div>
  );
};
