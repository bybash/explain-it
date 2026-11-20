import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { extname, isAbsolute, join } from "node:path";
import { imageProblem, sizeProblem } from "../render/load.ts";
import { LOGO_TYPES, LogoDataUrlSchema, type LogoType } from "../schema/config.ts";
import type { Validated } from "../schema/errors.ts";
import { fail, ok } from "../schema/result.ts";

/** Where a logo comes from: a file on this machine, or the image itself as a data URL. */
export type LogoSource = { readonly path: string } | { readonly dataUrl: string };

const extensions = Object.keys(LOGO_TYPES) as (keyof typeof LOGO_TYPES)[];
const extensionOf = (type: LogoType) => extensions.find((e) => LOGO_TYPES[e] === type) ?? ".png";

/** The image's bytes and type from its source, or what is wrong with it, named by `place`. */
const readSource = async (
  source: LogoSource,
  place: string,
): Promise<Validated<{ data: Buffer; type: LogoType }>> => {
  const problem = (message: string) => fail([{ path: place, message }]);
  if ("dataUrl" in source) {
    const parsed = LogoDataUrlSchema.safeParse(source.dataUrl);
    if (!parsed.success) return problem(parsed.error.issues[0]?.message ?? "is not a data URL");
    const [, type = "", base64 = ""] = /^data:([^;]+);base64,(.*)$/.exec(source.dataUrl) ?? [];
    const data = Buffer.from(base64, "base64");
    const tooBig = sizeProblem(data.length);
    if (tooBig) return problem(tooBig);
    const notImage = imageProblem(type as LogoType, data);
    return notImage ? problem(notImage) : ok({ data, type: type as LogoType });
  }
  // The IDE's agent and this server may have different working folders, so a relative path is ambiguous.
  if (!isAbsolute(source.path)) return problem("must be an absolute path");
  const type = LOGO_TYPES[extname(source.path) as keyof typeof LOGO_TYPES];
  if (!type)
    return problem(`must end in ${extensions.slice(0, -1).join(", ")} or ${extensions.at(-1)}`);
  try {
    const info = await stat(source.path);
    if (!info.isFile()) return problem(`${source.path} is not a file`);
    const tooBig = sizeProblem(info.size);
    if (tooBig) return problem(`${source.path} ${tooBig}`);
    const data = await readFile(source.path);
    const notImage = imageProblem(type, data);
    return notImage ? problem(`${source.path} ${notImage}`) : ok({ data, type });
  } catch (error) {
    const { code, message } = error as NodeJS.ErrnoException;
    return problem(
      `${source.path} ${code === "ENOENT" ? "missing" : `could not be read (${code ?? message})`}`,
    );
  }
};

/** A logo that passed its checks, ready to be written into a project's assets/. */
export type CheckedLogo = { readonly name: string; readonly data: Buffer };

/**
 * Reads and checks a logo the same way the loader does (type, content and
 * size) without writing anything; its file name is `logo-<mode>.<ext>`.
 */
export const checkLogo = async (
  mode: "light" | "dark",
  source: LogoSource,
): Promise<Validated<CheckedLogo>> => {
  const place = `logo.${mode}.${"dataUrl" in source ? "dataUrl" : "path"}`;
  const read = await readSource(source, place);
  if (!read.ok) return read;
  return ok({ name: `logo-${mode}${extensionOf(read.value.type)}`, data: read.value.data });
};

/** Writes a checked logo into the project's assets/, and removes the one it replaces if that had another type. */
export const saveLogo = async (projectDir: string, logo: CheckedLogo): Promise<void> => {
  const assets = join(projectDir, "assets");
  await mkdir(assets, { recursive: true });
  const temporary = join(assets, `${logo.name}.${process.pid}.tmp`);
  await writeFile(temporary, logo.data);
  await rename(temporary, join(assets, logo.name));
  const base = logo.name.slice(0, logo.name.lastIndexOf("."));
  for (const old of await readdir(assets))
    if (old !== logo.name && extensions.some((e) => old === `${base}${e}`))
      await rm(join(assets, old), { force: true });
};
