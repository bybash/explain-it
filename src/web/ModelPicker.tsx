import { useState } from "react";
import type { ModelChoice } from "../schema/settings.ts";
import { modelGroups, OTHER_MODEL, pickedModel } from "./model-picker.ts";

/**
 * Picks the model from the provider's list, grouped by family (Claude,
 * Gemini, GPT, Other), or "Another model…" to type its id (decision 050).
 * With no list, as for a local endpoint, it is the box alone.
 */
export const ModelPicker = ({
  id,
  choices,
  model,
  disabled,
  className,
  placeholder,
  pick,
}: {
  readonly id: string;
  readonly choices: readonly ModelChoice[];
  readonly model: string;
  readonly disabled?: boolean;
  readonly className: string;
  readonly placeholder?: string | undefined;
  /** A listed model as soon as it is picked; a typed one as it is typed. */
  readonly pick: (model: string) => void;
}) => {
  // "Another model…" stays open once chosen, even before anything is typed.
  const [typing, setTyping] = useState(false);
  const picked = typing ? OTHER_MODEL : pickedModel(choices, model);
  const box = (
    <input
      className={className}
      id={choices.length === 0 ? id : `${id}-typed`}
      aria-label={choices.length === 0 ? undefined : "Model id"}
      value={model}
      disabled={disabled}
      spellCheck={false}
      placeholder={placeholder ?? "The model's id, as the endpoint names it"}
      onChange={(e) => pick(e.target.value)}
    />
  );
  if (choices.length === 0) return box;
  return (
    <>
      <select
        className={className}
        id={id}
        value={picked}
        disabled={disabled}
        onChange={(e) => {
          const other = e.target.value === OTHER_MODEL;
          setTyping(other);
          if (!other) pick(e.target.value);
        }}
      >
        {modelGroups(choices).map((group) => (
          <optgroup key={group.family} label={group.family}>
            {group.choices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label} · {c.note}
              </option>
            ))}
          </optgroup>
        ))}
        <option value={OTHER_MODEL}>Another model…</option>
      </select>
      {picked === OTHER_MODEL && box}
    </>
  );
};
