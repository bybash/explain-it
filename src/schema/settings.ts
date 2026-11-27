import { z } from "zod";

/**
 * The LLM settings (SPEC, LLM): one OpenAI-compatible endpoint, its key and
 * one model. They live in `.env`; the settings page reads and writes them.
 */

/** The variables in `.env`; OPENROUTER_API_KEY is read as the key when LLM_API_KEY is not set. */
export const ENV_NAMES = {
  baseUrl: "LLM_BASE_URL",
  apiKey: "LLM_API_KEY",
  model: "LLM_MODEL",
  openRouterKey: "OPENROUTER_API_KEY",
} as const;

/** The model suggested when none is set: a capable model that OpenRouter serves. */
export const SUGGESTED_MODEL = "anthropic/claude-sonnet-5.5";

/**
 * Endpoints the page offers by name; any other base URL is "custom". One
 * with a `model` suggests that one, as its own API names models its own way.
 */
export const PROVIDERS = [
  { id: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-opus-5-5",
  },
  { id: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  { id: "ollama", label: "Ollama", baseUrl: "http://127.0.0.1:11434/v1" },
  { id: "lmstudio", label: "LM Studio", baseUrl: "http://127.0.0.1:1234/v1" },
] as const;

export const ProviderSchema = z.enum([...PROVIDERS.map((p) => p.id), "custom"]);
export type ProviderId = z.output<typeof ProviderSchema>;

/** A model offered by name in the settings and the chat (decision 050). */
export type ModelChoice = {
  readonly id: string;
  /** The family it is listed under: Claude, Gemini, GPT or Other. */
  readonly family: string;
  readonly label: string;
  /** What it is good for, in a few words. */
  readonly note: string;
};

const claude = (prefix: string, sep: "." | "-"): ModelChoice[] => [
  {
    id: `${prefix}claude-sonnet-5${sep}5`,
    family: "Claude",
    label: "Claude Sonnet 5.5",
    note: "balanced; the suggested model",
  },
  {
    id: `${prefix}claude-opus-5${sep}5`,
    family: "Claude",
    label: "Claude Opus 5.5",
    note: "flagship, for long agentic work",
  },
  {
    id: `${prefix}claude-fable-5${sep}2`,
    family: "Claude",
    label: "Claude Fable 5.2",
    note: "the most capable, and the dearest",
  },
  {
    id: `${prefix}claude-haiku-5${sep}5`,
    family: "Claude",
    label: "Claude Haiku 5.5",
    note: "fast and cheap; the recordings use it",
  },
];
const gpt = (prefix: string): ModelChoice[] => [
  {
    id: `${prefix}gpt-6.2-astra`,
    family: "GPT",
    label: "GPT-6.2 Astra",
    note: "OpenAI's flagship",
  },
  {
    id: `${prefix}gpt-6.2-sol`,
    family: "GPT",
    label: "GPT-6.2 Sol",
    note: "below Astra, for everyday work",
  },
  { id: `${prefix}gpt-6-luna`, family: "GPT", label: "GPT-6 Luna", note: "fast and cheap" },
];

/**
 * The models each provider offers by name (decision 050): ones that answer
 * with structured output, which every step of the assistant needs. OpenRouter
 * serves them all; Anthropic's and OpenAI's own APIs name their own. Any
 * other model can still be typed.
 */
export const MODEL_CHOICES: Readonly<Partial<Record<ProviderId, readonly ModelChoice[]>>> = {
  openrouter: [
    ...claude("anthropic/", "."),
    {
      id: "google/gemini-4-carbon",
      family: "Gemini",
      label: "Gemini 4 Carbon",
      note: "frontier, for complex reasoning",
    },
    {
      id: "google/gemini-4-argon",
      family: "Gemini",
      label: "Gemini 4 Argon",
      note: "Google's flagship reasoning model",
    },
    {
      id: "google/gemini-4-neon",
      family: "Gemini",
      label: "Gemini 4 Neon",
      note: "fast, mid-priced",
    },
    {
      id: "google/gemini-4-hydrogen",
      family: "Gemini",
      label: "Gemini 4 Hydrogen",
      note: "efficient, for many calls",
    },
    ...gpt("openai/"),
    { id: "x-ai/grok-4.7", family: "Other", label: "Grok 4.7", note: "SpaceXSI's flagship" },
    {
      id: "deepseek/deepseek-v4.1-flash",
      family: "Other",
      label: "DeepSeek V4.1 Flash",
      note: "very cheap",
    },
    {
      id: "mistralai/mistral-large-4-0",
      family: "Other",
      label: "Mistral Large 4",
      note: "Mistral's frontier model",
    },
    { id: "qwen/qwen4-max", family: "Other", label: "Qwen4 Max", note: "Alibaba's flagship" },
    {
      id: "moonshotai/kimi-k3.1-pro",
      family: "Other",
      label: "Kimi K3.1 Pro",
      note: "open-weight reasoning",
    },
  ],
  anthropic: claude("", "-"),
  openai: gpt(""),
};

/** The models to pick from for a provider; none for a local or custom endpoint, whose models are its own. */
export const modelChoices = (provider: ProviderId): readonly ModelChoice[] =>
  MODEL_CHOICES[provider] ?? [];

/** OpenRouter, the default provider (SPEC, LLM). */
export const DEFAULT_BASE_URL = PROVIDERS[0].baseUrl;
const MAX_URL = 500;
const MAX_MODEL = 200;
const MAX_KEY = 500;
/** Only this much of a key is ever shown, and only of a key long enough to hide the rest. */
const KEY_HINT = 4;
const MIN_HINTED_KEY = 12;
/** Model ids, URLs and keys have no spaces; a line break would also write a second line into `.env`. */
const NO_SPACES = /^\S+$/;
const SPACES_MESSAGE = "must not contain spaces or line breaks";

/** Names of this machine, as a URL's hostname gives them; a request addressed to any other did not come from its user. */
export const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"] as const;
/** Docker's name for the machine it runs on, where Ollama or LM Studio listen. */
const DOCKER_HOST = "host.docker.internal";

/** Whether a hostname is this machine, as Ollama and LM Studio are: their calls never cross the network. */
export const isThisMachine = (hostname: string): boolean =>
  (LOCAL_HOSTS as readonly string[]).includes(hostname) || hostname === DOCKER_HOST;

/** Whether calls to this base URL keep the key off the network: anything but http, or http to this machine. */
const keepsKeyPrivate = (url: string) => {
  // zod runs this even after the URL check fails; that failure is already named.
  if (!URL.canParse(url)) return true;
  const { protocol, hostname } = new URL(url);
  return protocol !== "http:" || isThisMachine(hostname);
};

export const SettingsUpdateSchema = z.strictObject({
  // Spaces are refused before the URL check, which would quietly drop a line break.
  baseUrl: z
    .string()
    .max(MAX_URL)
    .regex(NO_SPACES, SPACES_MESSAGE)
    .pipe(z.url({ protocol: /^https?$/ }))
    .refine(keepsKeyPrivate, {
      message:
        "http:// would send the key unencrypted: use https://, or http:// only for this machine",
    })
    .optional(),
  model: z
    .string()
    .trim()
    .min(1, "must not be empty")
    .max(MAX_MODEL)
    .regex(NO_SPACES, SPACES_MESSAGE)
    .optional(),
  /** A new key, or null to remove the one in `.env`; left out, the key stays. */
  apiKey: z
    .string()
    .min(1, "must not be empty")
    .max(MAX_KEY)
    .regex(NO_SPACES, SPACES_MESSAGE)
    .nullable()
    .optional(),
});
export type SettingsUpdate = z.output<typeof SettingsUpdateSchema>;

/** The settings the page can change, in the order it shows them. */
export const SETTING_FIELDS = SettingsUpdateSchema.keyof().options;
export type SettingField = (typeof SETTING_FIELDS)[number];
/** The variables a key can come from, LLM_API_KEY first. */
export const KEY_VARIABLES = [ENV_NAMES.apiKey, ENV_NAMES.openRouterKey] as const;
export type KeyVariable = (typeof KEY_VARIABLES)[number];

/** What the page is shown: everything but the key, of which only a hint. */
export const SettingsViewSchema = z.strictObject({
  baseUrl: z.string(),
  provider: ProviderSchema,
  model: z.string(),
  /** Whether the model is the suggested one because none is set. */
  modelIsSuggested: z.boolean(),
  key: z.discriminatedUnion("state", [
    z.strictObject({ state: z.literal("none") }),
    z.strictObject({
      state: z.literal("set"),
      hint: z.string(),
      variable: z.enum(KEY_VARIABLES),
    }),
  ]),
  /** Settings the environment sets, as Docker's `-e` does; they win over `.env`, so the page cannot change them. */
  fromEnvironment: z.array(z.enum(SETTING_FIELDS)),
});
export type SettingsView = z.output<typeof SettingsViewSchema>;

/** A key as the page may show it: its last four characters, or nothing of a short key. */
export const maskKey = (key: string): string =>
  `••••${key.length >= MIN_HINTED_KEY ? key.slice(-KEY_HINT) : ""}`;

const withoutSlash = (url: string) => url.replace(/\/+$/, "");

/** The preset a base URL belongs to, or "custom". */
export const providerOf = (baseUrl: string): ProviderId =>
  PROVIDERS.find((p) => withoutSlash(p.baseUrl) === withoutSlash(baseUrl))?.id ?? "custom";

/** The preset a base URL belongs to, if any. */
const presetOf = (baseUrl: string) => PROVIDERS.find((p) => p.id === providerOf(baseUrl));

/**
 * The model a preset suggests, as its own API names it: OpenRouter's and
 * Anthropic's; undefined for an endpoint whose models are the user's to name
 * (OpenAI, Ollama, LM Studio, a custom one).
 */
export const presetModel = (baseUrl: string): string | undefined => {
  if (providerOf(baseUrl) === "openrouter") return SUGGESTED_MODEL;
  const preset = presetOf(baseUrl);
  return preset && "model" in preset ? preset.model : undefined;
};

/** The model used when none is set: the preset's own, else `SUGGESTED_MODEL`. */
export const suggestedModel = (baseUrl: string): string => presetModel(baseUrl) ?? SUGGESTED_MODEL;

/** The host of Claude's own API, from its preset: the provider client calls it with Anthropic's API. */
export const ANTHROPIC_HOST = new URL(
  PROVIDERS.find((p) => p.id === "anthropic")?.baseUrl ?? "https://api.anthropic.com",
).hostname;
