import type { z } from "zod";
import { readAssetLogo, readJson } from "../render/load.ts";
import type { OpenedProject } from "../schema/api.ts";
import { type Config, LOGO_MODES, parseConfig } from "../schema/config.ts";
import { under, type Validated, type ValidationError } from "../schema/errors.ts";
import type { SetStyleArgsSchema } from "../schema/mcp.ts";
import { asObject, merged } from "../schema/merge-patch.ts";
import { laterGate } from "../schema/project.ts";
import { fail, ok } from "../schema/result.ts";
import { type CheckedLogo, checkLogo, saveLogo } from "./logo.ts";
import { projectDir, writeProjectFile } from "./projects.ts";

/** A change to a project's style, as MCP's `set_style` takes it: settings merged into config.json, and logo files to copy in. */
export type StyleChange = Omit<z.output<typeof SetStyleArgsSchema>, "slug">;

/**
 * Saves a style change over a project's config (SPEC, Config): every setting
 * and logo is checked before anything is written, so a bad one changes
 * nothing. MCP's `set_style` and the style gate both save this way. The
 * caller holds the project lock and tells listeners.
 */
export const saveStyle = async (
  projectsDir: string,
  slug: string,
  before: OpenedProject,
  change: StyleChange,
  now: Date,
): Promise<Validated<{ readonly config: Config; readonly warnings: readonly string[] }>> => {
  const dir = projectDir(projectsDir, slug);
  const logos: CheckedLogo[] = [];
  const errors: ValidationError[] = [];
  const names: Record<string, string> = {};
  for (const mode of LOGO_MODES) {
    const source = change.logo?.[mode];
    if (!source) continue;
    const checked = await checkLogo(mode, source);
    if (checked.ok) {
      logos.push(checked.value);
      names[mode] = checked.value.name;
    } else errors.push(...checked.errors);
  }
  const file = await readJson(dir, "config.json");
  const current = file.ok ? asObject(file.data) : undefined;
  const warnings =
    !file.ok && file.missing
      ? []
      : current === undefined
        ? ["config.json was broken, so it was started again from these settings"]
        : [];
  const { light: _light, dark: _dark, ...placement } = change.logo ?? {};
  const next = merged(
    merged(current ?? {}, change.config ?? {}),
    change.logo ? { logo: { ...placement, ...names } } : {},
  );
  const config = parseConfig(next);
  if (!config.ok) errors.push(...under("config", config.errors));
  // A logo named in config.json without being sent must already be in assets/ and pass its checks.
  else
    for (const mode of LOGO_MODES) {
      const name = config.value.logo?.[mode];
      if (name === undefined || name === names[mode]) continue;
      const asset = await readAssetLogo(dir, mode, name);
      if (!asset.ok) errors.push(...under("config", asset.errors));
    }
  if (errors.length > 0 || !config.ok) return fail(errors);

  for (const checked of logos) await saveLogo(dir, checked);
  await writeProjectFile(projectsDir, slug, "config.json", next);
  await writeProjectFile(projectsDir, slug, "project.json", {
    ...before.project,
    gate: laterGate(before.project.gate, "style"),
    updatedAt: now.toISOString(),
  });
  return ok({ config: config.value, warnings });
};
