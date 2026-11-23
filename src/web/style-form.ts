import type { StyleEdit } from "../schema/api.ts";
import {
  type Config,
  LOGO_MODES,
  LogoDataUrlSchema,
  type LogoImages,
  type LogoMode,
  LogoSchema,
  type LogoType,
  logoFileName,
} from "../schema/config.ts";
import { parseWith, under, type Validated } from "../schema/errors.ts";
import { mergePatchBetween } from "../schema/merge-patch.ts";
import { fail, ok } from "../schema/result.ts";

/** Logo files picked in the form and not saved yet, as data URLs, by mode. */
export type PendingLogos = Readonly<Partial<Record<LogoMode, string>>>;

/**
 * The draft with a new logo file for `mode`: named as the server will save
 * it, so the draft checks as it will be saved, and placed as the schema's
 * defaults say when the draft had no logo. A file that is not an image the
 * logo may be is named as the error.
 */
export const withLogoFile = (draft: Config, mode: LogoMode, dataUrl: string): Validated<Config> => {
  const image = parseWith(LogoDataUrlSchema, dataUrl);
  if (!image.ok) return fail(under(`logo.${mode}`, image.errors));
  const type = /^data:([^;,]+)/.exec(image.value)?.[1] as LogoType;
  const name = logoFileName(mode, type);
  return ok({
    ...draft,
    logo: draft.logo ? { ...draft.logo, [mode]: name } : LogoSchema.parse({ [mode]: name }),
  });
};

/** What Save sends: the settings that changed since the last save, and the logo files picked since. */
export const styleEdit = (saved: Config, draft: Config, pending: PendingLogos): StyleEdit => {
  const config = mergePatchBetween(saved, draft) as Record<string, unknown>;
  const files = LOGO_MODES.flatMap((mode) => {
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
  const image = (mode: LogoMode) => pending[mode] ?? (logo[mode] ? saved?.[mode] : undefined);
  const light = image("light");
  const dark = image("dark");
  const either = light ?? dark;
  return either === undefined ? undefined : { light: light ?? either, dark: dark ?? either };
};
