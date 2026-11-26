import type { ReactNode } from "react";
import {
  CARD_LIMITS,
  type Config,
  LOGO_CORNERS,
  LOGO_MAX_MB,
  LOGO_MODES,
  LOGO_SHOWS,
  type Logo,
  type LogoMode,
  TITLE_CARD_SECONDS,
} from "../schema/config.ts";
import type { ValidationError } from "../schema/errors.ts";
import { Errors } from "./Errors.tsx";

/** The style form's pieces: a section, a field's label, its box, and the line under it. */
export const LABEL_CLASS = "mt-3 block font-semibold";
export const INPUT_CLASS = "field mt-1.5 w-full bg-surface";
const NOTE_CLASS = "mb-1 text-muted text-sm";

/** One group of settings, as a card with its name at the top. */
export const Section = ({ title, children }: { title: string; children: ReactNode }) => {
  const id = `style-${title.toLowerCase().replaceAll(" ", "-")}-heading`;
  return (
    <section className="rounded-box border border-line bg-surface p-4" aria-labelledby={id}>
      <h4 id={id} className="mb-1 font-bold text-base">
        {title}
      </h4>
      {children}
    </section>
  );
};

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

/** `card` with `field` set, or without it when the value is left out. */
const withField = <C extends object, K extends keyof C>(
  card: C,
  field: K,
  value: C[K] | undefined,
) => {
  const { [field]: _old, ...rest } = card;
  return (value === undefined ? rest : { ...rest, [field]: value }) as C;
};

type Cards = NonNullable<Config["cards"]>;

/** The title and end cards: each turned on with the project's name, and its text. */
export const CardFields = ({
  cards,
  name,
  change,
}: {
  cards: Cards;
  /** The project's name, which a card starts from. */
  name: string;
  change: (cards: Cards) => void;
}) => {
  const { title, end } = cards;
  return (
    <>
      <Section title="Title card">
        <label className="mt-3 flex items-center gap-2">
          <input
            type="checkbox"
            checked={title !== undefined}
            onChange={(e) =>
              change(
                e.target.checked
                  ? { ...cards, title: { title: name } }
                  : withField(cards, "title", undefined),
              )
            }
          />
          Open the video with a title card
        </label>
        {title && (
          <>
            <Text
              id="style-title"
              label="Title"
              value={title.title}
              max={CARD_LIMITS.title}
              onChange={(text) => change({ ...cards, title: { ...title, title: text ?? "" } })}
            />
            <Text
              id="style-description"
              label="Description"
              long
              value={title.description}
              max={CARD_LIMITS.description}
              onChange={(text) =>
                change({ ...cards, title: withField(title, "description", text) })
              }
            />
            <label className={LABEL_CLASS} htmlFor="style-title-seconds">
              How long
            </label>
            <select
              id="style-title-seconds"
              className={INPUT_CLASS}
              value={title.seconds ?? ""}
              onChange={(e) =>
                change({
                  ...cards,
                  title: withField(
                    title,
                    "seconds",
                    e.target.value === "" ? undefined : Number(e.target.value),
                  ),
                })
              }
            >
              <option value="">Auto (3 to 5 s, by its text)</option>
              {Array.from(
                { length: TITLE_CARD_SECONDS.max - TITLE_CARD_SECONDS.min + 1 },
                (_, i) => TITLE_CARD_SECONDS.min + i,
              ).map((seconds) => (
                <option key={seconds} value={seconds}>
                  {seconds} s
                </option>
              ))}
            </select>
          </>
        )}
      </Section>

      <Section title="End card">
        <label className="mt-3 flex items-center gap-2">
          <input
            type="checkbox"
            checked={end !== undefined}
            onChange={(e) =>
              change(
                e.target.checked
                  ? { ...cards, end: { headline: name } }
                  : withField(cards, "end", undefined),
              )
            }
          />
          Close the video with an end card
        </label>
        {end && (
          <>
            <Text
              id="style-headline"
              label="Headline"
              value={end.headline}
              max={CARD_LIMITS.headline}
              onChange={(text) => change({ ...cards, end: { ...end, headline: text ?? "" } })}
            />
            {(
              [
                ["link", "Link (also drawn as a QR code)"],
                ["where", "Where to find it"],
                ["credit", "Credit"],
              ] as const
            ).map(([field, label]) => (
              <Text
                key={field}
                id={`style-${field}`}
                label={label}
                value={end[field]}
                max={CARD_LIMITS[field]}
                onChange={(text) => change({ ...cards, end: withField(end, field, text) })}
              />
            ))}
          </>
        )}
      </Section>
    </>
  );
};

const CORNER_LABELS = { "top-right": "Top right", "bottom-right": "Bottom right" } as const;
const SHOW_LABELS = {
  start: "On the title card",
  end: "On the end card",
  both: "On both cards",
  all: "On every frame",
} as const;

/** The logo: a file for each mode, its corner and when it shows, or none. */
export const LogoFields = ({
  logo,
  errors,
  pick,
  place,
  remove,
}: {
  logo: Logo | undefined;
  errors: readonly ValidationError[];
  pick: (mode: LogoMode, file: File | undefined) => void;
  place: (logo: Logo) => void;
  remove: () => void;
}) => (
  <Section title="Logo">
    <p className={NOTE_CLASS}>
      PNG, JPG or SVG, at most {LOGO_MAX_MB} MB. One file serves both modes.
    </p>
    {LOGO_MODES.map((mode) => (
      <div key={mode}>
        <label className={LABEL_CLASS} htmlFor={`style-logo-${mode}`}>
          Logo for the {mode} video
          {logo?.[mode] && <span className="font-normal text-muted"> · {logo[mode]}</span>}
        </label>
        <input
          id={`style-logo-${mode}`}
          type="file"
          accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml"
          className="mt-1.5 block w-full text-muted text-sm file:mr-3 file:cursor-pointer file:rounded-box file:border file:border-line file:bg-page file:px-3 file:py-1.5 file:font-semibold file:text-ink hover:file:border-accent"
          onChange={(e) => pick(mode, e.target.files?.[0])}
        />
      </div>
    ))}
    {logo && (
      <>
        <label className={LABEL_CLASS} htmlFor="style-logo-corner">
          Corner
        </label>
        <select
          id="style-logo-corner"
          className={INPUT_CLASS}
          value={logo.corner}
          onChange={(e) =>
            place({ ...logo, corner: e.target.value as (typeof LOGO_CORNERS)[number] })
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
          value={logo.show}
          onChange={(e) => place({ ...logo, show: e.target.value as (typeof LOGO_SHOWS)[number] })}
        >
          {LOGO_SHOWS.map((show) => (
            <option key={show} value={show}>
              {SHOW_LABELS[show]}
            </option>
          ))}
        </select>
        <button type="button" className="mt-3 text-error text-sm underline" onClick={remove}>
          Take the logo out
        </button>
      </>
    )}
    <Errors errors={errors} />
  </Section>
);
