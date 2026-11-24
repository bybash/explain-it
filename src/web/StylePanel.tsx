import { useEffect, useRef, useState } from "react";
import { FONTS } from "../engine/theme/fonts.ts";
import { PALETTES } from "../engine/theme/palettes.ts";
import type { OpenedProject } from "../schema/api.ts";
import {
  type Config,
  DEFAULT_CONFIG,
  LOGO_MAX_BYTES,
  LOGO_MAX_MB,
  type LogoImages,
  type LogoMode,
  parseConfig,
  RESOLUTIONS,
  THEME_MODES,
} from "../schema/config.ts";
import type { ValidationError } from "../schema/errors.ts";
import { getLogo, saveStyle } from "./api.ts";
import { Errors } from "./Errors.tsx";
import { capitalised, THEME_MODE_LABELS } from "./labels.ts";
import { StylePreview } from "./StylePreview.tsx";
import { CaptionsCard, MusicCard, PacingCard, VoiceCard } from "./sound-fields.tsx";
import { CardFields, INPUT_CLASS, LABEL_CLASS, LogoFields, Section } from "./style-fields.tsx";
import { type PendingLogos, previewLogo, styleEdit, withLogoFile } from "./style-form.ts";
import { Tabs } from "./ui.tsx";
import { useSamplePlayer } from "./useSamplePlayer.ts";

/** The cards in a tab: two to a row when the panel is wide enough. */
const CARDS_CLASS = "grid grid-cols-[1fr] items-start gap-4 @2xl:grid-cols-2";
/** The settings each tab changes, to mark the tab that has unsaved changes. */
const LOOK_SETTINGS = ["theme", "font", "cards", "logo", "output"] as const;
const SOUND_SETTINGS = ["voice", "pacing", "captions", "music"] as const;

/** Whether opening the project found config.json broken, so the defaults stand in for it. */
const configBroken = (opened: OpenedProject) =>
  opened.problems.some((p) => p.path === "config.json" || p.path.startsWith("config.json:"));

/**
 * The style gate's panel (SPEC, User flow): the look of the video (palette
 * and mode, font, output, the title and end cards, the logo) and its sound
 * (voice, pacing, captions, music) as a form, the video drawn with it
 * straight away, samples of the voice and the music, and Save. `blocked` says why the gate
 * cannot be approved yet: there are unsaved changes, or config.json is
 * broken and Save writes it again.
 */
export const StylePanel = ({
  opened,
  blocked,
}: {
  opened: OpenedProject;
  blocked: (reason: string | undefined) => void;
}) => {
  const { slug } = opened;
  const [saved, setSaved] = useState(opened.config ?? DEFAULT_CONFIG);
  const [draft, setDraft] = useState(saved);
  const [pending, setPending] = useState<PendingLogos>({});
  const [savedLogo, setSavedLogo] = useState<LogoImages | null>(null);
  const [fileErrors, setFileErrors] = useState<readonly ValidationError[]>([]);
  const [saveErrors, setSaveErrors] = useState<readonly ValidationError[]>([]);
  const [warnings, setWarnings] = useState<readonly string[]>([]);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  /** The style was saved elsewhere (MCP, another tab) while this form had changes. */
  const [elsewhere, setElsewhere] = useState(false);

  const player = useSamplePlayer();
  const [tab, setTab] = useState<"look" | "sound">("look");
  const broken = configBroken(opened);
  const edit = styleEdit(saved, draft, pending);
  const changed = Object.keys(edit.config ?? {}).length > 0 || edit.logo !== undefined;
  const unsaved = changed || broken;
  const changedIn = (settings: readonly string[]) =>
    settings.some((setting) => setting in (edit.config ?? {}));
  const checked = parseConfig(draft);
  const formErrors = checked.ok ? [] : checked.errors;

  useEffect(() => {
    void getLogo(slug).then((result) => {
      if (result.ok) setSavedLogo(result.value.logo);
    });
  }, [slug]);

  // A style saved elsewhere replaces the form when the form has no changes; while it has some,
  // the user is told, and the new style is taken once those changes are gone.
  const onDisk = JSON.stringify(opened.config);
  const seen = useRef(onDisk);
  useEffect(() => {
    if (onDisk === seen.current) return;
    if (changed) return setElsewhere(true);
    seen.current = onDisk;
    const next = opened.config ?? DEFAULT_CONFIG;
    setSaved(next);
    setDraft(next);
    setElsewhere(false);
  }, [onDisk, changed, opened.config]);

  useEffect(() => {
    blocked(
      broken
        ? "config.json is broken: save the style to write it again."
        : changed
          ? "Save the style before approving it."
          : undefined,
    );
  }, [blocked, broken, changed]);

  const change = (next: Config) => {
    setDraft(next);
    setJustSaved(false);
  };

  const pickLogo = (mode: LogoMode, file: File | undefined) => {
    if (!file) return;
    if (file.size > LOGO_MAX_BYTES)
      return setFileErrors([
        { path: `logo.${mode}`, message: `${file.name} is larger than ${LOGO_MAX_MB} MB` },
      ]);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const next = withLogoFile(draft, mode, dataUrl);
      if (!next.ok) return setFileErrors(next.errors);
      setFileErrors([]);
      setPending((p) => ({ ...p, [mode]: dataUrl }));
      change(next.value);
    };
    reader.readAsDataURL(file);
  };

  const save = async () => {
    setSaving(true);
    const result = await saveStyle(slug, edit);
    setSaving(false);
    if (!result.ok) return setSaveErrors(result.errors);
    setSaveErrors([]);
    setWarnings(result.value.warnings);
    seen.current = JSON.stringify(result.value.config);
    setSaved(result.value.config);
    setDraft(result.value.config);
    setPending({});
    setElsewhere(false);
    setJustSaved(true);
    const logo = await getLogo(slug);
    if (logo.ok) setSavedLogo(logo.value.logo);
  };

  return (
    <div className="@container mt-3 mb-2 flex flex-col gap-6">
      <section
        className="rounded-box border border-line bg-surface p-4"
        aria-labelledby="style-preview-heading"
      >
        <h3 id="style-preview-heading" className="mb-3 font-bold text-base">
          Preview
        </h3>
        <StylePreview
          opened={opened}
          config={checked.ok ? checked.value : saved}
          logo={previewLogo(draft, savedLogo, pending)}
        />
      </section>
      <form
        aria-label="Style"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {broken && (
          <p className="mb-4 text-error">
            config.json is broken, so the form shows the defaults. Saving writes it again.
          </p>
        )}
        <Tabs
          label="Style"
          selected={tab}
          select={setTab}
          tabs={[
            {
              id: "look",
              label: "Look",
              marked: changedIn(LOOK_SETTINGS) || edit.logo !== undefined,
              content: (
                <div className={CARDS_CLASS}>
                  <Section title="Colours">
                    <label className={LABEL_CLASS} htmlFor="style-palette">
                      Palette
                    </label>
                    <select
                      id="style-palette"
                      className={INPUT_CLASS}
                      value={
                        typeof draft.theme.palette === "string" ? draft.theme.palette : "custom"
                      }
                      onChange={(e) =>
                        change({ ...draft, theme: { ...draft.theme, palette: e.target.value } })
                      }
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
                    <div
                      className="mt-1.5 flex flex-wrap gap-4"
                      role="radiogroup"
                      aria-label="Mode"
                    >
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
                    name={opened.project.name}
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
                      setPending({});
                      change(rest);
                    }}
                  />

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
              ),
            },
            {
              id: "sound",
              label: "Sound",
              marked: changedIn(SOUND_SETTINGS),
              content: (
                <div className={CARDS_CLASS}>
                  <VoiceCard slug={slug} draft={draft} change={change} player={player} />
                  <PacingCard draft={draft} change={change} />
                  <CaptionsCard draft={draft} change={change} />
                  <MusicCard draft={draft} change={change} player={player} />
                </div>
              ),
            },
          ]}
        />
        <Errors errors={formErrors} />
        {/* Stays in view while the cards scroll, so Save is always at hand. */}
        <div className="sticky bottom-4 mt-4 flex flex-wrap items-center gap-3 rounded-box border border-line bg-surface p-3 shadow-sm">
          <button
            className="btn"
            type="submit"
            disabled={!unsaved || formErrors.length > 0 || saving}
          >
            Save the style
          </button>
          {changed && <span className="font-semibold text-accent">Unsaved changes</span>}
          {elsewhere && changed && (
            <span className="text-muted">The style was changed elsewhere; saving replaces it.</span>
          )}
          {justSaved && !unsaved && (
            <span className="text-muted" role="status">
              Saved.
            </span>
          )}
        </div>
        <Errors errors={saveErrors} />
        {warnings.length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-muted text-sm">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}
      </form>
    </div>
  );
};
