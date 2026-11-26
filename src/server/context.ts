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
  overLimitMessage,
} from "../schema/context.ts";
import type { Validated, ValidationError } from "../schema/errors.ts";
import { fail, ok } from "../schema/result.ts";

/** What adding a file came to; the API answers each kind with its own status. */
export type ContextAdded =
  | { readonly kind: "added"; readonly file: ContextFile }
  | { readonly kind: "refused" | "too-large"; readonly errors: readonly ValidationError[] };

const isContextKind = (name: string) =>
  (CONTEXT_EXTENSIONS as readonly string[]).includes(extname(name).toLowerCase());

/**
 * A file name safe in a folder and a URL, not taken yet, within the longest
 * a name can be: "Login spec.md" becomes "login-spec.md", and a second one
 * "login-spec-2.md".
 */
const newName = (name: string, taken: (name: string) => boolean): string => {
  const ext = extname(name).toLowerCase();
  const base =
    name
      .slice(0, name.length - ext.length)
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^[-.]+|-+$/g, "") || "context";
  const named = (suffix: string) =>
    `${base.slice(0, MAX_CONTEXT_NAME - ext.length - suffix.length)}${suffix}${ext}`;
  let unique = named("");
  for (let n = 2; taken(unique); n++) unique = named(`-${n}`);
  return unique;
};

/**
 * The project's context files, by name, with their text: the plain files of
 * a kind context can be. Anything else there (a folder, a link, a system's
 * own file) is passed over. A file is only ever reached by a name in here,
 * so never by a path outside `context/`.
 */
const files = async (projectDir: string): Promise<Map<string, string>> => {
  const dir = join(projectDir, CONTEXT_DIR);
  const entries = await readdir(dir, { withFileTypes: true }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    },
  );
  const names = entries.filter((e) => e.isFile() && isContextKind(e.name)).map((e) => e.name);
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
 * and what to do: nothing is ever summarised or cut silently. The caller
 * holds the project lock, as two files added at once would each count
 * without the other.
 */
export const addContext = async (
  projectDir: string,
  { name, text }: AddContext,
): Promise<ContextAdded> => {
  if (!isContextKind(name))
    return refused(
      "name",
      `"${extname(name).toLowerCase() || name}" is not a kind of context; use a text file such as .md, .txt, .mmd or source code`,
    );
  if (text.includes("\u0000")) return refused("text", "not text: the file looks binary");
  const existing = await files(projectDir);
  const unique = newName(name, (n) => existing.has(n));
  const total = [...existing.values()].reduce((sum, t) => sum + t.length, 0) + text.length;
  if (total > MAX_CONTEXT_CHARS)
    return {
      kind: "too-large",
      errors: [{ path: "text", message: overLimitMessage(unique, total) }],
    };
  await mkdir(join(projectDir, CONTEXT_DIR), { recursive: true });
  await writeWhole(join(projectDir, CONTEXT_DIR, unique), text);
  return { kind: "added", file: { name: unique, chars: text.length } };
};

const refused = (path: string, message: string): ContextAdded => ({
  kind: "refused",
  errors: [{ path, message }],
});

/** A context file's text, for the assistant, by its name in the list. */
export const readContext = async (projectDir: string, name: string): Promise<Validated<string>> => {
  const text = (await files(projectDir)).get(name);
  return text === undefined ? noFile(name) : ok(text);
};

/** Removes a context file, by its name in the list; the caller holds the project lock. */
export const removeContext = async (
  projectDir: string,
  name: string,
): Promise<Validated<undefined>> => {
  if (!(await files(projectDir)).has(name)) return noFile(name);
  await rm(join(projectDir, CONTEXT_DIR, name));
  return ok(undefined);
};
