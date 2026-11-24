import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { extname, join } from "node:path";
import { writeWhole } from "../render/write-whole.ts";
import {
  type AddContext,
  CONTEXT_DIR,
  CONTEXT_EXTENSIONS,
  type ContextFile,
  type ContextList,
  MAX_CONTEXT_CHARS,
  MAX_CONTEXT_NAME,
} from "../schema/context.ts";
import type { Validated } from "../schema/errors.ts";
import { fail, ok } from "../schema/result.ts";

/** A count as people read it: "100,010". */
const counted = (n: number) => n.toLocaleString("en-GB");

/**
 * A file name safe in a folder and a URL: lowercase letters, digits, dots,
 * dashes and underscores, keeping its extension. "Login spec.md" becomes
 * "login-spec.md".
 */
const safeName = (name: string) => {
  const ext = extname(name).toLowerCase();
  const base = name
    .slice(0, name.length - ext.length)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[-.]+|-+$/g, "");
  return `${(base || "context").slice(0, MAX_CONTEXT_NAME - ext.length)}${ext}`;
};

/** Whether a name is one of the project's context files: a safe name, never a path. */
const isContextName = (name: string) => name === safeName(name) && !name.includes("/");

/** The project's context files, by name, with their text. */
const files = async (projectDir: string): Promise<Map<string, string>> => {
  const dir = join(projectDir, CONTEXT_DIR);
  const names = await readdir(dir).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [] as string[];
    throw error;
  });
  const read = await Promise.all(
    names.sort().map(async (name) => [name, await readFile(join(dir, name), "utf8")] as const),
  );
  return new Map(read);
};

const noFile = (name: string) => fail([{ path: "name", message: `no context file "${name}"` }]);

/** A project's context: each file with its size, and how much of the limit they use. */
export const listContext = async (projectDir: string): Promise<ContextList> => {
  const found = [...(await files(projectDir))].map(
    ([name, text]): ContextFile => ({ name, chars: text.length }),
  );
  return {
    files: found,
    chars: found.reduce((sum, f) => sum + f.chars, 0),
    max: MAX_CONTEXT_CHARS,
  };
};

/**
 * Adds a file of context (SPEC, LLM), named safely and uniquely, once it is
 * text of a kind it knows and the project's context stays within the
 * limit. Above the limit nothing is kept, and the error says by how much
 * and what to do: nothing is ever summarised or cut silently.
 */
export const addContext = async (
  projectDir: string,
  { name, text }: AddContext,
): Promise<Validated<ContextFile>> => {
  const ext = extname(name).toLowerCase();
  if (!(CONTEXT_EXTENSIONS as readonly string[]).includes(ext))
    return fail([
      {
        path: "name",
        message: `"${ext || name}" is not a kind of context; use a text file such as .md, .txt, .mmd or source code`,
      },
    ]);
  if (text.includes("\u0000"))
    return fail([{ path: "text", message: "not text: the file looks binary" }]);
  const existing = await files(projectDir);
  const total = [...existing.values()].reduce((sum, t) => sum + t.length, 0) + text.length;
  if (total > MAX_CONTEXT_CHARS)
    return fail([
      {
        path: "context",
        message: `${counted(total)} characters with ${safeName(name)}; the most is ${counted(MAX_CONTEXT_CHARS)}. Remove a file or trim one, then add it again.`,
      },
    ]);
  const wanted = safeName(name);
  let unique = wanted;
  for (let n = 2; existing.has(unique); n++)
    unique = `${wanted.slice(0, wanted.length - ext.length)}-${n}${ext}`;
  await mkdir(join(projectDir, CONTEXT_DIR), { recursive: true });
  await writeWhole(join(projectDir, CONTEXT_DIR, unique), text);
  return ok({ name: unique, chars: text.length });
};

/** A context file's text, for the assistant; only a file in `context/`, by its name. */
export const readContext = async (projectDir: string, name: string): Promise<Validated<string>> => {
  if (!isContextName(name)) return noFile(name);
  const text = (await files(projectDir)).get(name);
  return text === undefined ? noFile(name) : ok(text);
};

export const removeContext = async (
  projectDir: string,
  name: string,
): Promise<Validated<undefined>> => {
  if (!isContextName(name) || !(await files(projectDir)).has(name)) return noFile(name);
  await rm(join(projectDir, CONTEXT_DIR, name));
  return ok(undefined);
};
