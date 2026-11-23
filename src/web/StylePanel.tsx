import { type ReactNode, useEffect, useState } from "react";
import { FONTS } from "../engine/theme/fonts.ts";
import { PALETTES } from "../engine/theme/palettes.ts";
import type { OpenedProject } from "../schema/api.ts";
import {
  CARD_LIMITS,
  type Config,
  LOGO_CORNERS,
  LOGO_MAX_BYTES,
  LOGO_MAX_MB,
  LOGO_SHOWS,
  type LogoImages,
  parseConfig,
  RESOLUTIONS,
  THEME_MODES,
} from "../schema/config.ts";
import type { ValidationError } from "../schema/errors.ts";
import { getLogo, saveStyle } from "./api.ts";
import { Errors } from "./Errors.tsx";
import { StylePreview } from "./StylePreview.tsx";
import {
  type PendingLogos,
  previewLogo,
  savedStyle,
  styleEdit,
  withLogoFile,
} from "./style-form.ts";
import { SectionTitle } from "./ui.tsx";

const LABEL_CLASS = "mt-3 block font-semibold";
const INPUT_CLASS = "field mt-1.5 w-full bg-surface";
const NOTE_CLASS = "mt-1 text-muted text-sm";

const MODE_LABELS = { light: "Light", dark: "Dark", both: "Both (two videos)" } as const;
const CORNER_LABELS = { "top-right": "Top right", "bottom-right": "Bottom right" } as const;
const SHOW_LABELS = {
  start: "On the title card",
  end: "On the end card",
  both: "On both cards",
  all: "On every frame",
} as const;
type Cards = NonNullable<Config["cards"]>;
const capitalised = (name: string) => name.charAt(0).toUpperCase() + name.slice(1);

/** A text box whose empty value means the field is left out. */
const Text = ({
  id,
  label,
  value,
  max,
  onChange,
  long = false,
}: {
  id: string;
  label: string;
  value: string | undefined;
  max: number;
  onChange: (value: string | undefined) => void;
  long?: boolean;
}) => {
  const Input = long ? "textarea" : "input";
  return (
    <>
      <label className={LABEL_CLASS} htmlFor={id}>
        {label}
      </label>
      <Input
        id={id}
        className={`${INPUT_CLASS} ${long ? "resize-y" : ""}`}
        value={value ?? ""}
        maxLength={max}
        {...(long ? { rows: 3 } : {})}
        onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
      />
    </>
  );
};

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <fieldset className="mt-6 border-0 p-0">
    <legend className="p-0 font-bold">{title}</legend>
    {children}
  </fieldset>
);

/** `card` with `field` set, or without it when the value is left out. */
const withField = <C extends object, K extends keyof C>(
  card: C,
  field: K,
  value: C[K] | undefined,
) => {
  const { [field]: _old, ...rest } = card;
  return (value === undefined ? rest : { ...rest, [field]: value }) as C;
};

/**
 * The style gate's panel (SPEC, User flow): the look of the video (palette
 * and mode, font, output, the title and end cards, the logo) as a form, the
 * video drawn with it straight away, and Save. `blocked` says why the gate
 * cannot be approved yet: there are unsaved changes.
 */
export const StylePanel = ({
  opened,
  blocked,
}: {
  opened: OpenedProject;
  blocked: (reason: string | undefined) => void;
}) => {
  const { slug } = opened;
  const [saved, setSaved] = useState(savedStyle(opened.config));
  const [draft, setDraft] = useState(saved);
  const [pending, setPending] = useState<PendingLogos>({});
  const [savedLogo, setSavedLogo] = useState<LogoImages | null>(null);
  const [fileErrors, setFileErrors] = useState<readonly ValidationError[]>([]);
  const [saveErrors, setSaveErrors] = useState<readonly ValidationError[]>([]);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const edit = styleEdit(saved, draft, pending);
  const unsaved = Object.keys(edit.config ?? {}).length > 0 || edit.logo !== undefined;
  const checked = parseConfig(draft);
  const formErrors = checked.ok ? [] : checked.errors;

  useEffect(() => {
    void getLogo(slug).then((result) => {
      if (result.ok) setSavedLogo(result.value.logo);
    });
  }, [slug]);

  // A style saved elsewhere (MCP, another tab) replaces the form when it has no changes.
  const onDisk = JSON.stringify(opened.config);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `onDisk` stands for `opened.config`.
  useEffect(() => {
    if (unsaved) return;
    const next = savedStyle(opened.config);
    setSaved(next);
    setDraft(next);
  }, [onDisk]);

  useEffect(() => {
    blocked(unsaved ? "Save the style before approving it." : undefined);
  }, [blocked, unsaved]);

  const change = (next: Config) => {
    setDraft(next);
    setJustSaved(false);
  };
  const cards = draft.cards ?? {};
  const setCards = (next: Cards) => {
    const { cards: _cards, ...rest } = draft;
    // A card that is left out is no key at all, so it compares equal to one never set.
    const kept = Object.fromEntries(Object.entries(next).filter(([, card]) => card !== undefined));
    change(Object.keys(kept).length === 0 ? rest : { ...rest, cards: kept as Cards });
  };

  const pickLogo = (mode: "light" | "dark", file: File | undefined) => {
    if (!file) return;
    if (file.size > LOGO_MAX_BYTES)
      return setFileErrors([
        { path: `logo.${mode}`, message: `${file.name} is larger than ${LOGO_MAX_MB} MB` },
      ]);
    setFileErrors([]);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      setPending((p) => ({ ...p, [mode]: dataUrl }));
      setDraft((d) => withLogoFile(d, mode, dataUrl));
      setJustSaved(false);
    };
    reader.readAsDataURL(file);
  };

  const removeLogo = () => {
    const { logo: _logo, ...rest } = draft;
    setPending({});
    change(rest);
  };

  const save = async () => {
    setSaving(true);
    const result = await saveStyle(slug, edit);
    setSaving(false);
    if (!result.ok) return setSaveErrors(result.errors);
    setSaveErrors([]);
    setSaved(result.value.config);
    setDraft(result.value.config);
    setPending({});
    setJustSaved(true);
    const logo = await getLogo(slug);
    if (logo.ok) setSavedLogo(logo.value.logo);
  };

  return (
    <div className="mt-3 mb-2 grid grid-cols-[1fr] items-start gap-6 min-[1101px]:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <form
        aria-label="Style"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Section title="Colours">
          <label className={LABEL_CLASS} htmlFor="style-palette">
            Palette
          </label>
          <select
            id="style-palette"
            className={INPUT_CLASS}
            value={typeof draft.theme.palette === "string" ? draft.theme.palette : "custom"}
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
          <div className="mt-1.5 flex flex-wrap gap-4" role="radiogroup" aria-label="Mode">
            {THEME_MODES.map((mode) => (
              <label key={mode} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="style-mode"
                  checked={draft.theme.mode === mode}
                  onChange={() => change({ ...draft, theme: { ...draft.theme, mode } })}
                />
                {MODE_LABELS[mode]}
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

        <Section title="Title card">
          <label className="mt-3 flex items-center gap-2">
            <input
              type="checkbox"
              checked={cards.title !== undefined}
              onChange={(e) =>
                setCards(
                  e.target.checked
                    ? { ...cards, title: { title: opened.project.name } }
                    : withField(cards, "title", undefined),
                )
              }
            />
            Open the video with a title card
          </label>
          {cards.title && (
            <>
              <Text
                id="style-title"
                label="Title"
                value={cards.title.title}
                max={CARD_LIMITS.title}
                onChange={(title) =>
                  cards.title &&
                  setCards({ ...cards, title: { ...cards.title, title: title ?? "" } })
                }
              />
              <Text
                id="style-description"
                label="Description"
                long
                value={cards.title.description}
                max={CARD_LIMITS.description}
                onChange={(value) =>
                  cards.title &&
                  setCards({ ...cards, title: withField(cards.title, "description", value) })
                }
              />
            </>
          )}
        </Section>

        <Section title="End card">
          <label className="mt-3 flex items-center gap-2">
            <input
              type="checkbox"
              checked={cards.end !== undefined}
              onChange={(e) =>
                setCards(
                  e.target.checked
                    ? { ...cards, end: { headline: opened.project.name } }
                    : withField(cards, "end", undefined),
                )
              }
            />
            Close the video with an end card
          </label>
          {cards.end && (
            <>
              <Text
                id="style-headline"
                label="Headline"
                value={cards.end.headline}
                max={CARD_LIMITS.headline}
                onChange={(headline) =>
                  cards.end &&
                  setCards({ ...cards, end: { ...cards.end, headline: headline ?? "" } })
                }
              />
              <Text
                id="style-link"
                label="Link (also drawn as a QR code)"
                value={cards.end.link}
                max={CARD_LIMITS.link}
                onChange={(value) =>
                  cards.end && setCards({ ...cards, end: withField(cards.end, "link", value) })
                }
              />
              <Text
                id="style-where"
                label="Where to find it"
                value={cards.end.where}
                max={CARD_LIMITS.where}
                onChange={(value) =>
                  cards.end && setCards({ ...cards, end: withField(cards.end, "where", value) })
                }
              />
              <Text
                id="style-credit"
                label="Credit"
                value={cards.end.credit}
                max={CARD_LIMITS.credit}
                onChange={(value) =>
                  cards.end && setCards({ ...cards, end: withField(cards.end, "credit", value) })
                }
              />
            </>
          )}
        </Section>

        <Section title="Logo">
          <p className={NOTE_CLASS}>
            PNG, JPG or SVG, at most {LOGO_MAX_MB} MB. One file serves both modes.
          </p>
          {(["light", "dark"] as const).map((mode) => (
            <div key={mode}>
              <label className={LABEL_CLASS} htmlFor={`style-logo-${mode}`}>
                For the {mode} video
                {draft.logo?.[mode] && (
                  <span className="font-normal text-muted"> · {draft.logo[mode]}</span>
                )}
              </label>
              <input
                id={`style-logo-${mode}`}
                type="file"
                accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml"
                className="mt-1.5 block text-sm"
                onChange={(e) => pickLogo(mode, e.target.files?.[0])}
              />
            </div>
          ))}
          {draft.logo && (
            <>
              <label className={LABEL_CLASS} htmlFor="style-logo-corner">
                Corner
              </label>
              <select
                id="style-logo-corner"
                className={INPUT_CLASS}
                value={draft.logo.corner}
                onChange={(e) =>
                  draft.logo &&
                  change({
                    ...draft,
                    logo: {
                      ...draft.logo,
                      corner: e.target.value as (typeof LOGO_CORNERS)[number],
                    },
                  })
                }
              >
                {LOGO_CORNERS.map((corner) => (
                  <option key={corner} value={corner}>
                    {CORNER_LABELS[corner]}
                  </option>
                ))}
              </select>
              <label className={LABEL_CLASS} htmlFor="style-logo-show">
                Shown
              </label>
              <select
                id="style-logo-show"
                className={INPUT_CLASS}
                value={draft.logo.show}
                onChange={(e) =>
                  draft.logo &&
                  change({
                    ...draft,
                    logo: { ...draft.logo, show: e.target.value as (typeof LOGO_SHOWS)[number] },
                  })
                }
              >
                {LOGO_SHOWS.map((show) => (
                  <option key={show} value={show}>
                    {SHOW_LABELS[show]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="mt-3 text-error text-sm underline"
                onClick={removeLogo}
              >
                Take the logo out
              </button>
            </>
          )}
          <Errors errors={fileErrors} />
        </Section>

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

        <Errors errors={formErrors} />
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            className="btn"
            type="submit"
            disabled={!unsaved || formErrors.length > 0 || saving}
          >
            Save the style
          </button>
          {unsaved && <span className="font-semibold text-accent">Unsaved changes</span>}
          {justSaved && !unsaved && (
            <span className="text-muted" role="status">
              Saved.
            </span>
          )}
        </div>
        <Errors errors={saveErrors} />
      </form>
      <div className="min-[1101px]:sticky min-[1101px]:top-4">
        <SectionTitle level={3}>Preview</SectionTitle>
        <StylePreview
          opened={opened}
          config={checked.ok ? checked.value : saved}
          logo={previewLogo(draft, savedLogo, pending)}
        />
      </div>
    </div>
  );
};
