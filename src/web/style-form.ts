import type { StyleEdit } from "../schema/api.ts";
import {
  type Config,
  DEFAULT_CONFIG,
  type LogoImages,
  type LogoType,
  logoFileName,
} from "../schema/config.ts";
import { mergePatchBetween } from "../schema/merge-patch.ts";

/** Logo files picked in the form and not saved yet, as data URLs, by mode. */
export type PendingLogos = { readonly light?: string; readonly dark?: string };

type Mode = keyof PendingLogos;

/** A data URL's media type. */
const typeOf = (dataUrl: string) => /^data:([^;,]+)/.exec(dataUrl)?.[1] as LogoType;

/**
 * The draft with a new logo file for `mode`: named as the server will save
 * it, so the draft checks as it will be saved, and placed in the default
 * corner when the draft had no logo.
 */
export const withLogoFile = (draft: Config, mode: Mode, dataUrl: string): Config => ({
  ...draft,
  logo: {
    corner: "top-right",
    show: "both",
    ...draft.logo,
    [mode]: logoFileName(mode, typeOf(dataUrl)),
  },
});

/** What Save sends: the settings that changed since the last save, and the logo files picked since. */
export const styleEdit = (saved: Config, draft: Config, pending: PendingLogos): StyleEdit => {
  const config = mergePatchBetween(saved, draft) as Record<string, unknown>;
  const files = (["light", "dark"] as const).flatMap((mode) => {
    const dataUrl = pending[mode];
    return dataUrl && draft.logo?.[mode] ? [[mode, { dataUrl }] as const] : [];
  });
  return files.length > 0 ? { config, logo: Object.fromEntries(files) } : { config };
};

/**
 * The logo the preview draws for the draft: a file picked but not saved, or
 * the saved one; one file serves both modes, and none once the draft takes
 * the logo out.
 */
export const previewLogo = (
  draft: Config,
  saved: LogoImages | null,
  pending: PendingLogos,
): LogoImages | undefined => {
  const logo = draft.logo;
  if (!logo) return undefined;
  const image = (mode: Mode) => pending[mode] ?? (logo[mode] ? saved?.[mode] : undefined);
  const light = image("light");
  const dark = image("dark");
  const either = light ?? dark;
  return either === undefined ? undefined : { light: light ?? either, dark: dark ?? either };
};

/** The style a project starts from when it has no config.json. */
export const savedStyle = (config: Config | null): Config => config ?? DEFAULT_CONFIG;
