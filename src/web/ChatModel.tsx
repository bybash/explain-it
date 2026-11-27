import { useEffect, useState } from "react";
import type { ValidationError } from "../schema/errors.ts";
import { ENV_NAMES, modelChoices, type SettingsView } from "../schema/settings.ts";
import { getSettings, saveSettings } from "./api.ts";
import { Errors } from "./Errors.tsx";
import { ModelPicker } from "./ModelPicker.tsx";
import { pickedModel } from "./model-picker.ts";

/**
 * The model the chat answers with, picked above the message box (decision
 * 050). It is the setting the Settings page saves, so a pick there or here
 * is the same, and applies from the next message on. A listed model saves
 * as soon as it is picked; a typed one when "Use" is pressed.
 */
export const ChatModel = ({ className = "" }: { readonly className?: string }) => {
  const [view, setView] = useState<SettingsView | undefined>();
  const [draft, setDraft] = useState("");
  const [errors, setErrors] = useState<readonly ValidationError[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    void getSettings().then((result) => {
      if (!live) return;
      if (!result.ok) return setErrors(result.errors);
      setView(result.value);
      setDraft(result.value.model);
    });
    return () => {
      live = false;
    };
  }, []);

  if (!view) return errors.length > 0 ? <Errors className={className} errors={errors} /> : null;
  const choices = modelChoices(view.provider);
  const locked = view.fromEnvironment.includes("model");

  const save = async (model: string) => {
    setSaving(true);
    const result = await saveSettings({ model });
    setSaving(false);
    if (!result.ok) return setErrors(result.errors);
    setErrors([]);
    setView(result.value);
    setDraft(result.value.model);
  };
  const typed = pickedModel(choices, draft) !== draft;

  return (
    <div className={`flex flex-wrap items-center gap-2 text-sm ${className}`}>
      <label htmlFor="chat-model" className="text-muted">
        Model
      </label>
      <ModelPicker
        className="field min-w-0 flex-1 bg-page py-1 text-sm disabled:opacity-60"
        id="chat-model"
        choices={choices}
        model={draft}
        disabled={locked || saving}
        pick={(model) => {
          setDraft(model);
          if (choices.some((c) => c.id === model)) void save(model);
        }}
      />
      {typed && draft.trim() !== view.model && (
        <button
          type="button"
          className="text-muted text-xs underline hover:text-ink"
          disabled={saving || draft.trim() === ""}
          onClick={() => void save(draft.trim())}
        >
          Use
        </button>
      )}
      {locked && (
        <span className="text-muted text-xs">
          set by <code>{ENV_NAMES.model}</code>
        </span>
      )}
      <Errors className="w-full" errors={errors} />
    </div>
  );
};
