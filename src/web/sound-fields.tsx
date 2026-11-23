import {
  CAPTION_SIZES,
  type Config,
  MUSIC_MOODS,
  MusicSchema,
  PACE_TIMINGS,
  PACES,
  VoiceSchema,
} from "../schema/config.ts";
import { INPUT_CLASS, LABEL_CLASS, Section } from "./style-fields.tsx";
import { type SampleState, useSample } from "./useSample.ts";
import { voiceGroups } from "./voices.ts";

const NOTE_CLASS = "mt-1 text-muted text-sm";
const CHECK_CLASS = "mt-2 flex items-center gap-2";
const RADIOS_CLASS = "mt-1.5 flex flex-wrap gap-x-4 gap-y-1";
const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The voice's and the music's limits, from the schema. */
const SPEED = VoiceSchema.shape.speed.unwrap();
const VOLUME = MusicSchema.shape.volumeDb.unwrap();

/** Plays a sample, or says why it cannot; the first voice sample may wait for the model. */
const SampleButton = ({
  label,
  state,
  play,
  stop,
  waiting,
}: {
  label: string;
  state: SampleState;
  play: () => void;
  stop: () => void;
  waiting: string;
}) => (
  <div className="mt-3">
    <button
      type="button"
      className="rounded-full border border-line px-3 py-1.5 text-sm hover:border-accent disabled:opacity-60"
      onClick={state.kind === "playing" ? stop : play}
      disabled={state.kind === "loading"}
    >
      {state.kind === "loading" ? waiting : state.kind === "playing" ? "■ Stop" : `▶ ${label}`}
    </button>
    {state.kind === "failed" && (
      <p className="mt-1 text-error text-sm" role="alert">
        {state.message}
      </p>
    )}
  </div>
);

type Change = (next: Config) => void;

/** The narration's voice and speed, with a sample of the script's first line. */
export const VoiceCard = ({
  slug,
  draft,
  change,
}: {
  slug: string;
  draft: Config;
  change: Change;
}) => {
  const { voice } = draft;
  const sample = useSample();
  const set = (patch: Partial<Config["voice"]>) =>
    change({ ...draft, voice: { ...voice, ...patch } });
  return (
    <Section title="Voice">
      <label className={CHECK_CLASS}>
        <input
          type="checkbox"
          checked={voice.enabled}
          onChange={(e) => set({ enabled: e.target.checked })}
        />
        Narrate the video
      </label>
      {voice.enabled && (
        <>
          <label className={LABEL_CLASS} htmlFor="style-voice">
            Voice
          </label>
          <select
            id="style-voice"
            className={INPUT_CLASS}
            value={voice.id}
            onChange={(e) => set({ id: e.target.value as Config["voice"]["id"] })}
          >
            {voiceGroups().map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.voices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <label className={LABEL_CLASS} htmlFor="style-voice-speed">
            Speed <span className="font-normal text-muted">· {voice.speed.toFixed(2)}×</span>
          </label>
          <input
            id="style-voice-speed"
            type="range"
            className="mt-1.5 w-full accent-accent"
            min={SPEED.minValue ?? 0.5}
            max={SPEED.maxValue ?? 2}
            step={0.05}
            value={voice.speed}
            onChange={(e) => set({ speed: Number(e.target.value) })}
          />
          <SampleButton
            label="Play a sample"
            state={sample.state}
            stop={sample.stop}
            play={() =>
              void sample.play(
                `/api/projects/${encodeURIComponent(slug)}/samples/voice?voice=${voice.id}&speed=${voice.speed}`,
              )
            }
            waiting="Getting the voice ready…"
          />
          {sample.state.kind === "loading" && (
            <p className={NOTE_CLASS}>
              The first time downloads the voice model, which takes a minute or two.
            </p>
          )}
        </>
      )}
    </Section>
  );
};

/** How unhurried the video is: the pause after each beat and the shortest beat. */
export const PacingCard = ({ draft, change }: { draft: Config; change: Change }) => (
  <Section title="Pacing">
    <div className="mt-1.5 grid gap-2" role="radiogroup" aria-label="Pacing">
      {PACES.map((pace) => (
        <label key={pace} className="flex items-start gap-2">
          <input
            type="radio"
            name="style-pacing"
            className="mt-1"
            checked={draft.pacing === pace}
            onChange={() => change({ ...draft, pacing: pace })}
          />
          <span>
            {capitalised(pace)}
            <span className="block text-muted text-sm">
              {PACE_TIMINGS[pace].pauseAfter} s after each beat; a beat lasts at least{" "}
              {PACE_TIMINGS[pace].minBeat} s
            </span>
          </span>
        </label>
      ))}
    </div>
  </Section>
);

/** Which captions show, and how large. */
export const CaptionsCard = ({ draft, change }: { draft: Config; change: Change }) => {
  const { captions } = draft;
  const set = (patch: Partial<Config["captions"]>) =>
    change({ ...draft, captions: { ...captions, ...patch } });
  return (
    <Section title="Captions">
      <label className={CHECK_CLASS}>
        <input
          type="checkbox"
          checked={captions.narration}
          onChange={(e) => set({ narration: e.target.checked })}
        />
        The narration, as subtitles
      </label>
      <label className={CHECK_CLASS}>
        <input
          type="checkbox"
          checked={captions.step}
          onChange={(e) => set({ step: e.target.checked })}
        />
        Each step's caption
      </label>
      <span className={LABEL_CLASS}>Size</span>
      <div className={RADIOS_CLASS} role="radiogroup" aria-label="Caption size">
        {CAPTION_SIZES.map((size) => (
          <label key={size} className="flex items-center gap-2">
            <input
              type="radio"
              name="style-caption-size"
              checked={captions.size === size}
              onChange={() => set({ size })}
            />
            {size}
          </label>
        ))}
      </div>
    </Section>
  );
};

/** The music: its mood, which take of it, how loud under the voice, with a sample. */
export const MusicCard = ({ draft, change }: { draft: Config; change: Change }) => {
  const { music } = draft;
  const sample = useSample();
  const set = (patch: Partial<Config["music"]>) =>
    change({ ...draft, music: { ...music, ...patch } });
  return (
    <Section title="Music">
      <label className={CHECK_CLASS}>
        <input
          type="checkbox"
          checked={music.enabled}
          onChange={(e) => set({ enabled: e.target.checked })}
        />
        Music under the voice
      </label>
      {music.enabled && (
        <>
          <span className={LABEL_CLASS}>Mood</span>
          <div className={RADIOS_CLASS} role="radiogroup" aria-label="Mood">
            {MUSIC_MOODS.map((mood) => (
              <label key={mood} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="style-music-mood"
                  checked={music.mood === mood}
                  onChange={() => set({ mood })}
                />
                {capitalised(mood)}
              </label>
            ))}
          </div>
          <span className={LABEL_CLASS}>Take</span>
          <div className="mt-1.5 flex items-center gap-3">
            <span className="tabular-nums">#{music.seed}</span>
            <button
              type="button"
              className="rounded-full border border-line px-3 py-1 text-sm hover:border-accent"
              onClick={() => set({ seed: music.seed + 1 })}
            >
              Another take
            </button>
          </div>
          <label className={LABEL_CLASS} htmlFor="style-music-volume">
            Volume under the voice{" "}
            <span className="font-normal text-muted">· {music.volumeDb} dB</span>
          </label>
          <input
            id="style-music-volume"
            type="range"
            className="mt-1.5 w-full accent-accent"
            min={VOLUME.minValue ?? -60}
            max={VOLUME.maxValue ?? 0}
            step={1}
            value={music.volumeDb}
            onChange={(e) => set({ volumeDb: Number(e.target.value) })}
          />
          <SampleButton
            label="Listen"
            state={sample.state}
            stop={sample.stop}
            play={() =>
              void sample.play(
                `/api/samples/music?mood=${music.mood}&seed=${music.seed}&volumeDb=${music.volumeDb}`,
              )
            }
            waiting="Making the music…"
          />
        </>
      )}
    </Section>
  );
};
