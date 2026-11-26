import { FONTS } from "../engine/theme/fonts.ts";
import { PALETTES } from "../engine/theme/palettes.ts";
import { type Config, type LogoMode, RESOLUTIONS, THEME_MODES } from "../schema/config.ts";
import type { ValidationError } from "../schema/errors.ts";
import type { Storyboard } from "../schema/storyboard.ts";
import { CameraCard } from "./CameraCard.tsx";
import { capitalised, THEME_MODE_LABELS } from "./labels.ts";
import { CardFields, INPUT_CLASS, LABEL_CLASS, LogoFields, Section } from "./style-fields.tsx";

/** The cards in a tab: two to a row when the panel is wide enough. */
export const CARDS_CLASS = "grid grid-cols-[1fr] items-start gap-4 @2xl:grid-cols-2";

/**
 * The style gate's Look tab (SPEC, User flow): palette and mode, font, the
 * title and end cards, the logo, and the output.
 */
export const LookTab = ({
  draft,
  change,
  name,
  fileErrors,
  pickLogo,
  removeLogo,
  scenes,
  framing,
}: {
  draft: Config;
  change: (next: Config) => void;
  /** The project's name, which the title card falls back to. */
  name: string;
  fileErrors: readonly ValidationError[];
  pickLogo: (mode: LogoMode, file: File | undefined) => void;
  /** Forgets the logo files picked and not saved yet. */
  removeLogo: () => void;
  /** The script's scenes, each with a camera of its own; none before there is a script. */
  scenes: Storyboard["scenes"];
  /** The scene whose camera is being set, for the preview to show. */
  framing: (scene: string) => void;
}) => (
  <div className={CARDS_CLASS}>
    <Section title="Theme">
      <label className={LABEL_CLASS} htmlFor="style-palette">
        Palette
      </label>
      <select
        id="style-palette"
        className={INPUT_CLASS}
        value={typeof draft.theme.palette === "string" ? draft.theme.palette : "custom"}
        onChange={(e) => change({ ...draft, theme: { ...draft.theme, palette: e.target.value } })}
      >
        {Object.keys(PALETTES).map((name) => (
          <option key={name} value={name}>
            {capitalised(name)}
          </option>
        ))}
        {typeof draft.theme.palette !== "string" && (
          <option value="custom" disabled>
            Custom (set over MCP)
          </option>
        )}
      </select>
      <span className={LABEL_CLASS}>Mode</span>
      <div className="mt-1.5 flex flex-wrap gap-4" role="radiogroup" aria-label="Mode">
        {THEME_MODES.map((mode) => (
          <label key={mode} className="flex items-center gap-2">
            <input
              type="radio"
              name="style-mode"
              checked={draft.theme.mode === mode}
              onChange={() => change({ ...draft, theme: { ...draft.theme, mode } })}
            />
            {THEME_MODE_LABELS[mode]}
          </label>
        ))}
      </div>
    </Section>

    <Section title="Text">
      <label className={LABEL_CLASS} htmlFor="style-font">
        Font
      </label>
      <select
        id="style-font"
        className={INPUT_CLASS}
        value={draft.font}
        onChange={(e) => change({ ...draft, font: e.target.value })}
      >
        {FONTS.map((font) => (
          <option key={font.id} value={font.id}>
            {font.family}
          </option>
        ))}
      </select>
    </Section>

    <CardFields
      cards={draft.cards ?? {}}
      name={name}
      change={(cards) => {
        const { cards: _cards, ...rest } = draft;
        // A card that is left out is no key at all, so it compares equal to one never set.
        const kept = Object.fromEntries(Object.entries(cards).filter(([, c]) => c));
        change(Object.keys(kept).length === 0 ? rest : { ...rest, cards: kept });
      }}
    />

    <LogoFields
      logo={draft.logo}
      errors={fileErrors}
      pick={pickLogo}
      place={(logo) => change({ ...draft, logo })}
      remove={() => {
        const { logo: _logo, ...rest } = draft;
        removeLogo();
        change(rest);
      }}
    />

    {scenes.length > 0 && (
      <CameraCard
        scenes={scenes}
        cameras={draft.camera ?? {}}
        editing={framing}
        change={(cameras) => {
          const { camera: _camera, ...rest } = draft;
          change(Object.keys(cameras).length === 0 ? rest : { ...rest, camera: cameras });
        }}
      />
    )}

    <Section title="Output">
      <label className={LABEL_CLASS} htmlFor="style-resolution">
        Resolution
      </label>
      <select
        id="style-resolution"
        className={INPUT_CLASS}
        value={draft.output.resolution}
        onChange={(e) =>
          change({
            ...draft,
            output: { resolution: e.target.value as (typeof RESOLUTIONS)[number] },
          })
        }
      >
        {RESOLUTIONS.map((resolution) => (
          <option key={resolution} value={resolution}>
            {resolution}
          </option>
        ))}
      </select>
    </Section>
  </div>
);
