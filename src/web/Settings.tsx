import { type FormEvent, useCallback, useEffect, useState } from "react";
import type { ValidationError } from "../schema/errors.ts";
import {
  ENV_NAMES,
  PROVIDERS,
  providerOf,
  type SettingsView,
  SUGGESTED_MODEL,
} from "../schema/settings.ts";
import { getSettings, saveSettings } from "./api.ts";
import { Errors } from "./Errors.tsx";
import { formOf, type SettingsForm, settingsChanges } from "./settings-form.ts";

/** Says that the environment sets a field, which then cannot be changed here. */
const FromEnvironment = ({ variable }: { variable: string }) => (
  <p className="field-note">
    Set by <code>{variable}</code> in the environment, which wins over <code>.env</code>.
  </p>
);

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
      <section className="page">
        <h1 className="page-title">Settings</h1>
        {errors.length === 0 ? <p className="muted">Loading…</p> : <Errors errors={errors} />}
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
    <section className="page">
      <h1 className="page-title">Settings</h1>
      <p className="muted">
        The LLM that drafts the graph and the script: OpenRouter by default, or any
        OpenAI-compatible endpoint. Saved to <code>.env</code> on this machine.
      </p>
      <form className="settings" onSubmit={submit}>
        <label htmlFor="settings-provider">Provider</label>
        <select
          id="settings-provider"
          value={provider}
          disabled={locked("baseUrl")}
          onChange={(e) => {
            const preset = PROVIDERS.find((p) => p.id === e.target.value);
            // Custom clears the URL for the user to type their endpoint's.
            change({ baseUrl: preset ? preset.baseUrl : "" });
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

        <label htmlFor="settings-base-url">Base URL</label>
        <input
          id="settings-base-url"
          value={form.baseUrl}
          disabled={locked("baseUrl")}
          spellCheck={false}
          onChange={(e) => change({ baseUrl: e.target.value })}
        />
        {locked("baseUrl") && <FromEnvironment variable={ENV_NAMES.baseUrl} />}

        <label htmlFor="settings-model">Model</label>
        <input
          id="settings-model"
          value={form.model}
          disabled={locked("model")}
          spellCheck={false}
          placeholder={SUGGESTED_MODEL}
          onChange={(e) => change({ model: e.target.value })}
        />
        {locked("model") ? (
          <FromEnvironment variable={ENV_NAMES.model} />
        ) : (
          view.modelIsSuggested && (
            <p className="field-note">Suggested; saving keeps it, or type another.</p>
          )
        )}

        <label htmlFor="settings-key">API key</label>
        <input
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
          <label className="check">
            <input
              type="checkbox"
              checked={form.removeKey}
              onChange={(e) => change({ removeKey: e.target.checked, apiKey: "" })}
            />
            Remove the saved key
          </label>
        ) : (
          (provider === "ollama" || provider === "lmstudio") && (
            <p className="field-note">A local model needs no key.</p>
          )
        )}

        <div className="settings-actions">
          <button type="submit" disabled={saving}>
            Save
          </button>
          {saved && (
            <span className="muted" role="status">
              Saved to .env
            </span>
          )}
        </div>
        <Errors errors={errors} />
      </form>
    </section>
  );
};
