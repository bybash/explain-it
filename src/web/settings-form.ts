import type { SettingsUpdate, SettingsView } from "../schema/settings.ts";

/** What the settings form holds; the key field is empty unless a new key is typed. */
export type SettingsForm = {
  readonly baseUrl: string;
  readonly model: string;
  readonly apiKey: string;
  readonly removeKey: boolean;
  /** Save the model even if unchanged: the suggested one is then written to `.env`. */
  readonly saveModel: boolean;
};

export const formOf = (view: SettingsView): SettingsForm => ({
  baseUrl: view.baseUrl,
  model: view.model,
  apiKey: "",
  removeKey: false,
  saveModel: false,
});

/**
 * The update to send: only what changed and what the environment does not
 * set. A blank key field keeps the saved key; it is never sent.
 */
export const settingsChanges = (view: SettingsView, form: SettingsForm): SettingsUpdate => {
  const open = (field: SettingsView["fromEnvironment"][number]) =>
    !view.fromEnvironment.includes(field);
  const baseUrl = form.baseUrl.trim();
  const model = form.model.trim();
  const apiKey = form.apiKey.trim();
  return {
    ...(open("baseUrl") && baseUrl !== view.baseUrl ? { baseUrl } : {}),
    ...(open("model") && (model !== view.model || (form.saveModel && view.modelIsSuggested))
      ? { model }
      : {}),
    ...(open("apiKey") && apiKey !== ""
      ? { apiKey }
      : open("apiKey") && form.removeKey
        ? { apiKey: null }
        : {}),
  };
};
