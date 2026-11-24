import { type FormEvent, type ReactNode, useEffect, useId, useState } from "react";
import type { OpenedProject } from "../schema/api.ts";
import type { ValidationError } from "../schema/errors.ts";
import {
  type Brief,
  MAX_AUDIENCE,
  MAX_HOOK,
  MAX_NOTES,
  MAX_TAKEAWAY,
  STORY_SHAPES,
  type StoryShape,
} from "../schema/story.ts";
import { saveBrief } from "./api.ts";
import { Errors } from "./Errors.tsx";
import { capitalised } from "./labels.ts";

/** The brief as the form holds it: every field as text, "" when blank. */
type BriefForm = Readonly<Record<"audience" | "takeaway" | "shape" | "hook" | "notes", string>>;

const formOf = (brief: Brief | null): BriefForm => ({
  audience: brief?.audience ?? "",
  takeaway: brief?.takeaway ?? "",
  shape: brief?.shape ?? "",
  hook: brief?.hook ?? "",
  notes: brief?.notes ?? "",
});

/** The brief a form makes: blank fields are left out, as the brief's fields are optional. */
const briefOf = (form: BriefForm): Brief => {
  const text = (value: string) => (value.trim() === "" ? undefined : value.trim());
  const brief = {
    version: 1 as const,
    audience: text(form.audience),
    takeaway: text(form.takeaway),
    shape: (text(form.shape) as StoryShape | undefined) ?? undefined,
    hook: text(form.hook),
    notes: text(form.notes),
  };
  return Object.fromEntries(
    Object.entries(brief).filter(([, value]) => value !== undefined),
  ) as Brief;
};

const same = (a: Brief, b: Brief) => JSON.stringify(a) === JSON.stringify(b);

/** A labelled field with a line under it, which describes the control. */
const Field = ({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: (control: { id: string; "aria-describedby": string }) => ReactNode;
}) => {
  const id = useId();
  return (
    <div className="flex flex-col gap-1 text-sm">
      <label className="font-semibold" htmlFor={id}>
        {label}
      </label>
      {children({ id, "aria-describedby": `${id}-hint` })}
      <span id={`${id}-hint`} className="text-muted">
        {hint}
      </span>
    </div>
  );
};

/**
 * The story brief, at the Script gate (SPEC, Brief): who the video is for,
 * the one thing to remember, its shape, its hook, and the user's notes for
 * this story. Every field is optional. An agent reads it with `get_project`
 * before writing the beats. `blocked` says why the gate cannot be approved
 * while the brief has changes not saved.
 */
export const BriefPanel = ({
  opened,
  blocked,
}: {
  opened: OpenedProject;
  blocked: (reason: string | undefined) => void;
}) => {
  const [saved, setSaved] = useState(briefOf(formOf(opened.brief)));
  const [form, setForm] = useState(() => formOf(opened.brief));
  const [errors, setErrors] = useState<readonly ValidationError[]>([]);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const unsaved = !same(briefOf(form), saved);
  const shape = STORY_SHAPES.find((s) => s.id === form.shape);

  // A brief saved elsewhere (over MCP, or in another tab) shows here, unless this one has changes.
  const fromServer = JSON.stringify(opened.brief);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new brief from the server resets the form.
  useEffect(() => {
    const next = briefOf(formOf(opened.brief));
    setSaved(next);
    if (!unsaved) setForm(formOf(opened.brief));
  }, [fromServer]);

  useEffect(() => {
    blocked(unsaved ? "Save the brief first." : undefined);
    return () => blocked(undefined);
  }, [blocked, unsaved]);

  const change = (patch: Partial<BriefForm>) => {
    setForm({ ...form, ...patch });
    setJustSaved(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const result = await saveBrief(opened.slug, briefOf(form));
    setSaving(false);
    if (!result.ok) return setErrors(result.errors);
    setErrors([]);
    setSaved(result.value.brief);
    setForm(formOf(result.value.brief));
    setJustSaved(true);
  };

  return (
    <section
      className="rounded-box border border-line bg-surface p-4"
      aria-labelledby="brief-heading"
    >
      <h3 id="brief-heading" className="font-bold text-base">
        The story
      </h3>
      <p className="mt-1 mb-4 text-muted text-sm">
        Agree the story before the beats. Every field is optional; the beats are written to follow
        what is here.
      </p>
      <form className="grid max-w-[640px] gap-4" onSubmit={submit}>
        <Field label="Who it is for" hint="It sets what they already know.">
          {(control) => (
            <input
              {...control}
              className="field"
              value={form.audience}
              maxLength={MAX_AUDIENCE}
              placeholder="New backend developers"
              onChange={(e) => change({ audience: e.target.value })}
            />
          )}
        </Field>
        <Field label="The one thing to remember" hint="One sentence. Every beat serves it.">
          {(control) => (
            <input
              {...control}
              className="field"
              value={form.takeaway}
              maxLength={MAX_TAKEAWAY}
              onChange={(e) => change({ takeaway: e.target.value })}
            />
          )}
        </Field>
        <Field
          label="Shape"
          hint={shape ? `${capitalised(shape.beats)}. For ${shape.suits}.` : "Not chosen."}
        >
          {(control) => (
            <select
              {...control}
              className="field"
              value={form.shape}
              onChange={(e) => change({ shape: e.target.value })}
            >
              <option value="">Not chosen</option>
              {STORY_SHAPES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Hook" hint="What the first beat says, so the viewer wants the rest.">
          {(control) => (
            <input
              {...control}
              className="field"
              value={form.hook}
              maxLength={MAX_HOOK}
              onChange={(e) => change({ hook: e.target.value })}
            />
          )}
        </Field>
        <Field
          label="Notes and rules"
          hint="This story's own: what to stress, what to leave out. House rules for every project are in Settings."
        >
          {(control) => (
            <textarea
              {...control}
              className="field min-h-24"
              value={form.notes}
              maxLength={MAX_NOTES}
              onChange={(e) => change({ notes: e.target.value })}
            />
          )}
        </Field>
        <div className="flex items-center gap-3">
          <button className="btn" type="submit" disabled={saving || !unsaved}>
            Save the brief
          </button>
          {justSaved && !unsaved && (
            <span className="text-muted" role="status">
              Saved.
            </span>
          )}
        </div>
        <Errors errors={errors} />
      </form>
    </section>
  );
};
