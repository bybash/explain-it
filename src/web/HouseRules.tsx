import { type FormEvent, useEffect, useState } from "react";
import type { ValidationError } from "../schema/errors.ts";
import { MAX_HOUSE_RULES } from "../schema/story.ts";
import { getHouseRules, saveHouseRules } from "./api.ts";
import { Errors } from "./Errors.tsx";
import { SectionTitle } from "./ui.tsx";

/**
 * The house rules (SPEC, Brief): the user's rules for every project's story,
 * kept in `house-rules.md` in the projects folder, which agents read first.
 */
export const HouseRules = () => {
  const [saved, setSaved] = useState<string | undefined>();
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<readonly ValidationError[]>([]);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    void getHouseRules().then((result) => {
      if (!result.ok) return setErrors(result.errors);
      setSaved(result.value.text);
      setText(result.value.text);
    });
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const result = await saveHouseRules(text);
    setSaving(false);
    if (!result.ok) return setErrors(result.errors);
    setErrors([]);
    setSaved(result.value.text);
    setJustSaved(true);
  };

  return (
    <section className="mt-10 max-w-[560px]" aria-label="Storytelling">
      <SectionTitle level={2}>Storytelling</SectionTitle>
      <form className="grid gap-1.5" onSubmit={submit}>
        <label className="font-semibold" htmlFor="house-rules">
          House rules
        </label>
        <textarea
          id="house-rules"
          className="field min-h-36 bg-surface"
          aria-describedby="house-rules-hint"
          value={text}
          maxLength={MAX_HOUSE_RULES}
          disabled={saved === undefined}
          placeholder={"- No jargon.\n- End with a link to the docs."}
          onChange={(e) => {
            setText(e.target.value);
            setJustSaved(false);
          }}
        />
        <p id="house-rules-hint" className="text-muted text-sm">
          Rules every video's story follows, over the guide's own advice. Agents read them with the
          guide. Saved to <code>house-rules.md</code> in the projects folder, where they can be
          edited or shared by hand.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <button className="btn" type="submit" disabled={saving || text === saved}>
            Save the house rules
          </button>
          {justSaved && text === saved && (
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
