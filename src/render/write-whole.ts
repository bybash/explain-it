import { randomUUID } from "node:crypto";
import { chmod, rename, writeFile } from "node:fs/promises";

/**
 * Writes a file whole: into a file of its own first, then renamed over the
 * one named, so a reader never finds it half written, and two writers never
 * share a scratch file. `mode` sets who may read it, as for the `.env` file.
 */
export const writeWhole = async (
  file: string,
  data: string | Uint8Array,
  { mode }: { readonly mode?: number } = {},
): Promise<void> => {
  const partial = `${file}.${randomUUID()}.partial`;
  await writeFile(partial, data, mode === undefined ? {} : { mode });
  // The mode given to writeFile is narrowed by the process's umask; chmod is not.
  if (mode !== undefined) await chmod(partial, mode);
  await rename(partial, file);
};
