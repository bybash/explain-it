import { chmod, readFile, rename, writeFile } from "node:fs/promises";
import { parseWith, type Validated } from "../schema/errors.ts";
import { fail, ok } from "../schema/result.ts";
import {
  DEFAULT_BASE_URL,
  ENV_NAMES,
  KEY_VARIABLES,
  maskKey,
  providerOf,
  SETTING_FIELDS,
  type SettingField,
  SettingsUpdateSchema,
  type SettingsView,
  SUGGESTED_MODEL,
} from "../schema/settings.ts";
import { parseEnvFile, updateEnvFile } from "./env-file.ts";

/** The settings an LLM call uses (slice 5.1); the key in full, so they never leave the server. */
export type LlmSettings = {
  readonly baseUrl: string;
  readonly model: string;
  readonly apiKey?: string;
};

export type SettingsStore = {
  /** The settings as the page may see them: the key only as a hint. */
  readonly view: () => Promise<SettingsView>;
  readonly current: () => Promise<LlmSettings>;
  /** Validates an update from the page and writes it to `.env`. */
  readonly update: (body: unknown) => Promise<Validated<SettingsView>>;
};

type Found<V extends string = string> = {
  readonly value: string;
  readonly from: "environment" | "file";
  readonly variable: V;
};

/**
 * The LLM settings, read fresh from `.env` on every call. Each setting is
 * looked up in the environment first, then in `.env`: a variable the
 * environment sets (Docker's `-e`) wins, so the page shows it but cannot
 * change it. Within one place, LLM_API_KEY wins over OPENROUTER_API_KEY.
 * The file is written whole and only its owner can read it.
 */
export const settingsStore = ({
  envFile,
  environment,
}: {
  /** The `.env` file the page writes. */
  readonly envFile: string;
  /** The process's own environment, without what `.env` holds. */
  readonly environment: Readonly<Record<string, string | undefined>>;
}): SettingsStore => {
  const readFileText = async (): Promise<string> => {
    try {
      return await readFile(envFile, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
      throw error;
    }
  };

  const resolve = async () => {
    const file = parseEnvFile(await readFileText());
    /** The first of `variables` set in the environment, or else the first set in `.env`. */
    const find = <V extends string>(variables: readonly V[]): Found<V> | undefined => {
      const set = (value: string | undefined): value is string =>
        value !== undefined && value !== "";
      for (const variable of variables) {
        const value = environment[variable];
        if (set(value)) return { value, from: "environment", variable };
      }
      for (const variable of variables) {
        const value = file.get(variable);
        if (set(value)) return { value, from: "file", variable };
      }
      return undefined;
    };
    return {
      baseUrl: find([ENV_NAMES.baseUrl]),
      model: find([ENV_NAMES.model]),
      apiKey: find(KEY_VARIABLES),
    } satisfies Record<SettingField, Found | undefined>;
  };

  const view = async (): Promise<SettingsView> => {
    const found = await resolve();
    const baseUrl = found.baseUrl?.value ?? DEFAULT_BASE_URL;
    return {
      baseUrl,
      provider: providerOf(baseUrl),
      model: found.model?.value ?? SUGGESTED_MODEL,
      modelIsSuggested: found.model === undefined,
      key: found.apiKey
        ? {
            state: "set",
            hint: maskKey(found.apiKey.value),
            variable: found.apiKey.variable,
          }
        : { state: "none" },
      fromEnvironment: SETTING_FIELDS.filter((field) => found[field]?.from === "environment"),
    };
  };

  return {
    view,
    current: async () => {
      const found = await resolve();
      return {
        baseUrl: found.baseUrl?.value ?? DEFAULT_BASE_URL,
        model: found.model?.value ?? SUGGESTED_MODEL,
        ...(found.apiKey ? { apiKey: found.apiKey.value } : {}),
      };
    },
    update: async (body) => {
      const parsed = parseWith(SettingsUpdateSchema, body);
      if (!parsed.ok) return parsed;
      const found = await resolve();
      const asked = SETTING_FIELDS.filter((field) => parsed.value[field] !== undefined);
      const locked = asked.filter((field) => found[field]?.from === "environment");
      if (locked.length > 0)
        return fail(
          locked.map((field) => ({
            path: field,
            message: `${found[field]?.variable} is set in the environment, which wins over .env: change it there`,
          })),
        );
      const { baseUrl, model, apiKey } = parsed.value;
      const changes: Record<string, string | null> = {
        ...(baseUrl !== undefined ? { [ENV_NAMES.baseUrl]: baseUrl } : {}),
        ...(model !== undefined ? { [ENV_NAMES.model]: model } : {}),
        // A new key replaces both names, so the one written is the one read.
        ...(apiKey !== undefined
          ? { [ENV_NAMES.apiKey]: apiKey, [ENV_NAMES.openRouterKey]: null }
          : {}),
      };
      const partial = `${envFile}.partial`;
      await writeFile(partial, updateEnvFile(await readFileText(), changes), { mode: 0o600 });
      await chmod(partial, 0o600);
      await rename(partial, envFile);
      return ok(await view());
    },
  };
};
