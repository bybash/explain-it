import type { RenderSettings } from "../render/render.ts";
import { type Config, RESOLUTIONS, type Resolution, THEME_MODES } from "../schema/config.ts";
import type { Validated, ValidationError } from "../schema/errors.ts";
import { fail, ok } from "../schema/result.ts";

/** A theme the command can be asked for: one mode, or both. */
type ThemeChoice = Config["theme"]["mode"];

/** `explain-it render <project> [--theme light|dark|both] [--resolution 1080p|720p]` */
export type RenderArgs = {
  readonly project: string;
  readonly theme?: ThemeChoice;
  readonly resolution?: Resolution;
};

const OPTIONS = { "--theme": THEME_MODES, "--resolution": RESOLUTIONS } as const;
type Option = keyof typeof OPTIONS;
const isOption = (flag: string): flag is Option => flag in OPTIONS;

const oneOf = (values: readonly string[]) =>
  `must be one of ${values.map((v) => JSON.stringify(v)).join(", ")}`;

/** Reads the render command's arguments; every problem names the flag or argument it is about. */
export const parseRenderArgs = (argv: readonly string[]): Validated<RenderArgs> => {
  const errors: ValidationError[] = [];
  const values: Partial<Record<Option, string>> = {};
  let project: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (!arg.startsWith("--")) {
      if (project === undefined) project = arg;
      else errors.push({ path: arg, message: "unexpected argument" });
      continue;
    }
    const [flag = "", inline] = arg.split(/=(.*)/s);
    if (!isOption(flag)) {
      errors.push({ path: flag, message: "unknown option" });
      continue;
    }
    const value = inline ?? argv[++i];
    if (value === undefined || value.startsWith("--")) {
      errors.push({ path: flag, message: "needs a value" });
      if (value !== undefined) i--;
      continue;
    }
    const allowed: readonly string[] = OPTIONS[flag];
    if (!allowed.includes(value)) errors.push({ path: flag, message: oneOf(allowed) });
    else values[flag] = value;
  }
  if (project === undefined) errors.unshift({ path: "<project>", message: "required" });
  if (errors.length > 0 || project === undefined) return fail(errors);
  return ok({
    project,
    ...(values["--theme"] ? { theme: values["--theme"] as ThemeChoice } : {}),
    ...(values["--resolution"] ? { resolution: values["--resolution"] as Resolution } : {}),
  });
};

/** The flags where given, else the project's config. */
export const renderSettings = (args: RenderArgs, config: Config): RenderSettings => {
  const mode = args.theme ?? config.theme.mode;
  return {
    themes: mode === "both" ? ["light", "dark"] : [mode],
    resolution: args.resolution ?? config.output.resolution,
  };
};
