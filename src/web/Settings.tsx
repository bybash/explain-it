import { type FormEvent, useCallback, useEffect, useState } from "react";
import type { ValidationError } from "../schema/errors.ts";
import {
  ENV_NAMES,
  modelAfterSwitch,
  modelChoices,
  openingModel,
  PROVIDERS,
  presetModel,
  providerOf,
  type SettingsView,
} from "../schema/settings.ts";
import { getSettings, saveSettings } from "./api.ts";
import { Errors } from "./Errors.tsx";
import { FromEnvironment } from "./FromEnvironment.tsx";
import { HouseRules } from "./HouseRules.tsx";
import { ModelPicker } from "./ModelPicker.tsx";
import { formOf, type SettingsForm, settingsChanges } from "./settings-form.ts";
import { Muted, PageTitle } from "./ui.tsx";

/** A line under a field. */
const NOTE_CLASS = "text-muted text-sm";
/** A field's label. */
const LABEL_CLASS = "mt-3.5 font-semibold";
/** A text box or the provider select. */
const INPUT_CLASS = "field bg-surface disabled:opacity-60";

/**
 * The LLM settings: the endpoint, chosen by provider or typed, the model and
 * the key. Saved to `.env`; the key is shown only by its last characters.
 */
export const Settings = () => {
  const [view, setView] = useState<SettingsView | undefined>();
  const [form, setForm] = useState<SettingsForm | undefined>();
  const [errors, setErrors] = useState<readonly ValidationError[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const show = useCallback((next: SettingsView) => {
    setView(next);
    setForm(formOf(next));
  }, []);

  useEffect(() => {
    void getSettings().then((result) =>
      result.ok ? show(result.value) : setErrors(result.errors),
    );
  }, [show]);

  if (!view || !form)
    return (
      <section>
        <PageTitle>Settings</PageTitle>
        {errors.length === 0 ? <Muted>Loading…</Muted> : <Errors errors={errors} />}
      </section>
    );

  const locked = (field: SettingsView["fromEnvironment"][number]) =>
    view.fromEnvironment.includes(field);
  const change = (patch: Partial<SettingsForm>) => {
    setForm({ ...form, ...patch });
    setSaved(false);
  };
  const provider = providerOf(form.baseUrl);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const result = await saveSettings(settingsChanges(view, { ...form, saveModel: true }));
    setSaving(false);
    if (!result.ok) return setErrors(result.errors);
    setErrors([]);
    show(result.value);
    setSaved(true);
  };

  return (
    <section>
      <PageTitle>Settings</PageTitle>
      <Muted>
        The LLM that drafts the graph and the script: OpenRouter by default, or any
        OpenAI-compatible endpoint. Saved to <code>.env</code> on this machine.
      </Muted>
      <form className="mt-6 grid max-w-[560px] gap-1.5" onSubmit={submit}>
        <label className={LABEL_CLASS} htmlFor="settings-provider">
          Provider
        </label>
        <select
          className={INPUT_CLASS}
          id="settings-provider"
          value={provider}
          disabled={locked("baseUrl")}
          onChange={(e) => {
            const preset = PROVIDERS.find((p) => p.id === e.target.value);
            const baseUrl = preset ? preset.baseUrl : "";
            // A model still as suggested follows the endpoint: its preset's own, or none to type. One the user chose is kept.
            const suggested =
              (view.modelIsSuggested && form.model === view.model) ||
              (form.baseUrl !== view.baseUrl && form.model === openingModel(form.baseUrl));
            // Custom clears the URL for the user to type their endpoint's.
            // One picked from the old provider's list goes, as the new one names its models its own way.
            change({
              baseUrl,
              model: suggested ? openingModel(baseUrl) : modelAfterSwitch(form.model, baseUrl),
            });
            if (!preset) document.getElementById("settings-base-url")?.focus();
          }}
        >
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
          <option value="custom">Custom endpoint</option>
        </select>

        <label className={LABEL_CLASS} htmlFor="settings-base-url">
          Base URL
        </label>
        <input
          className={INPUT_CLASS}
          id="settings-base-url"
          value={form.baseUrl}
          disabled={locked("baseUrl")}
          spellCheck={false}
          onChange={(e) => change({ baseUrl: e.target.value })}
        />
        {locked("baseUrl") && <FromEnvironment variable={ENV_NAMES.baseUrl} />}

        <label className={LABEL_CLASS} htmlFor="settings-model">
          Model
        </label>
        <ModelPicker
          key={provider}
          className={INPUT_CLASS}
          id="settings-model"
          choices={modelChoices(provider)}
          model={form.model}
          disabled={locked("model")}
          placeholder={presetModel(form.baseUrl)}
          pick={(model) => change({ model })}
        />
        {locked("model") ? (
          <FromEnvironment variable={ENV_NAMES.model} />
        ) : (
          view.modelIsSuggested && (
            <p className={NOTE_CLASS}>Suggested; saving keeps it, or pick another.</p>
          )
        )}

        <label className={LABEL_CLASS} htmlFor="settings-key">
          API key
        </label>
        <input
          className={INPUT_CLASS}
          id="settings-key"
          type="password"
          autoComplete="off"
          value={form.apiKey}
          disabled={locked("apiKey") || form.removeKey}
          placeholder={
            view.key.state === "set" ? `Saved: ${view.key.hint}` : "None yet; paste a key"
          }
          onChange={(e) => change({ apiKey: e.target.value })}
        />
        {locked("apiKey") && view.key.state === "set" ? (
          <FromEnvironment variable={view.key.variable} />
        ) : view.key.state === "set" ? (
          <label className="flex items-center gap-2 text-muted text-sm">
            <input
              type="checkbox"
              checked={form.removeKey}
              onChange={(e) => change({ removeKey: e.target.checked, apiKey: "" })}
            />
            Remove the saved key
          </label>
        ) : (
          (provider === "ollama" || provider === "lmstudio") && (
            <p className={NOTE_CLASS}>A local model needs no key.</p>
          )
        )}

        <div className="mt-5 flex items-center gap-3">
          <button className="btn" type="submit" disabled={saving}>
            Save
          </button>
          {saved && (
            <span className="text-muted" role="status">
              Saved to .env
            </span>
          )}
        </div>
        <Errors errors={errors} />
      </form>
      <HouseRules />
    </section>
  );
};
