import {
  CAPTION_SIZES,
  type Config,
  MUSIC_MOODS,
  MUSIC_VOLUMES_DB,
  PACE_TIMINGS,
  PACES,
  VOICE_SPEEDS,
} from "../schema/config.ts";
import { musicSample, voiceSample } from "./api.ts";
import { capitalised } from "./labels.ts";
import { INPUT_CLASS, LABEL_CLASS, Section } from "./style-fields.tsx";
import { Pill } from "./ui.tsx";
import type { SamplePlayer, SampleSource } from "./useSamplePlayer.ts";
import { voiceGroups } from "./voices.ts";

const NOTE_CLASS = "mt-1 text-muted text-sm";
const CHECK_CLASS = "mt-2 flex items-center gap-2";
const RADIOS_CLASS = "mt-1.5 flex flex-wrap gap-x-4 gap-y-1";

/** The draft and how to change it: what every sound card takes. */
type Form = { readonly draft: Config; readonly change: (next: Config) => void };

/** Sets part of one setting in the draft, keeping the rest of it. */
const setter =
  <K extends "voice" | "captions" | "music">({ draft, change }: Form, key: K) =>
  (patch: Partial<Config[K]>) =>
    change({ ...draft, [key]: { ...draft[key], ...patch } });

/** Plays one sample, stops it, or says why it could not play; one plays at a time. */
const SampleButton = ({
  source,
  label,
  waiting,
  player,
  fetchSound,
}: {
  source: SampleSource;
  label: string;
  waiting: string;
  player: SamplePlayer;
  fetchSound: Parameters<SamplePlayer["play"]>[1];
}) => {
  const { state } = player;
  const mine = state.kind !== "idle" && state.source === source;
  return (
    <div className="mt-3">
      <Pill
        onClick={() =>
          mine && state.kind !== "failed" ? player.stop() : player.play(source, fetchSound)
        }
      >
        {mine && state.kind === "loading"
          ? `${waiting} · Stop`
          : mine && state.kind === "playing"
            ? "■ Stop"
            : `▶ ${label}`}
      </Pill>
      {mine && state.kind === "failed" && (
        <p className="mt-1 text-error text-sm" role="alert">
          {state.message}
        </p>
      )}
    </div>
  );
};

/** The narration's voice and speed, with a sample of the script's first line. */
export const VoiceCard = ({
  slug,
  player,
  ...form
}: Form & { slug: string; player: SamplePlayer }) => {
  const { voice } = form.draft;
  const set = setter(form, "voice");
  const loading = player.state.kind === "loading" && player.state.source === "voice";
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
            min={VOICE_SPEEDS.min}
            max={VOICE_SPEEDS.max}
            step={0.05}
            value={voice.speed}
            onChange={(e) => set({ speed: Number(e.target.value) })}
          />
          <SampleButton
            source="voice"
            label="Play a sample"
            waiting="Getting the voice ready…"
            player={player}
            fetchSound={(signal) => voiceSample(slug, voice, signal)}
          />
          {loading && (
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
export const PacingCard = ({ draft, change }: Form) => (
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
export const CaptionsCard = (form: Form) => {
  const { captions } = form.draft;
  const set = setter(form, "captions");
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
      <label className={`${CHECK_CLASS} pl-6`}>
        <input
          type="checkbox"
          checked={captions.list}
          disabled={!captions.step}
          onChange={(e) => set({ list: e.target.checked })}
        />
        Listed down the left, the current one solid
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
export const MusicCard = ({ player, ...form }: Form & { player: SamplePlayer }) => {
  const { music, voice } = form.draft;
  const set = setter(form, "music");
  return (
    <Section title="Music">
      <label className={CHECK_CLASS}>
        <input
          type="checkbox"
          checked={music.enabled}
          onChange={(e) => set({ enabled: e.target.checked })}
        />
        Music
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
            <Pill onClick={() => set({ seed: music.seed + 1 })}>Another take</Pill>
          </div>
          {voice.enabled ? (
            <>
              <label className={LABEL_CLASS} htmlFor="style-music-volume">
                Volume under the voice{" "}
                <span className="font-normal text-muted">· {music.volumeDb} dB</span>
              </label>
              <input
                id="style-music-volume"
                type="range"
                className="mt-1.5 w-full accent-accent"
                min={MUSIC_VOLUMES_DB.min}
                max={MUSIC_VOLUMES_DB.max}
                step={1}
                value={music.volumeDb}
                onChange={(e) => set({ volumeDb: Number(e.target.value) })}
              />
            </>
          ) : (
            <p className={NOTE_CLASS}>
              Without narration the music is the whole soundtrack, at the video's loudness.
            </p>
          )}
          <SampleButton
            source="music"
            label="Listen"
            waiting="Making the music…"
            player={player}
            fetchSound={(signal) =>
              musicSample({ ...music, volumeDb: voice.enabled ? music.volumeDb : 0 }, signal)
            }
          />
        </>
      )}
    </Section>
  );
};
