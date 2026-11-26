import jsonpatch, { type Operation } from "fast-json-patch";
import type { Validated } from "./errors.ts";
import { fail, ok } from "./result.ts";

/**
 * The new document from a whole one or a JSON Patch on the current one:
 * exactly one of the two. A failed patch step is named by its index.
 */
export const edited = (
  file: "graph" | "storyboard",
  current: unknown,
  whole: unknown,
  patch: unknown,
): Validated<unknown> => {
  if (whole === undefined && patch === undefined)
    return fail([{ path: "(arguments)", message: `give ${file} or patch` }]);
  if (whole !== undefined && patch !== undefined)
    return fail([{ path: "(arguments)", message: `give ${file} or patch, not both` }]);
  if (whole !== undefined) return ok(whole);
  if (current === null)
    return fail([
      { path: "patch", message: `${file}.json is missing or broken; send the whole ${file}` },
    ]);
  try {
    const patched = jsonpatch.applyPatch(
      structuredClone(current),
      patch as Operation[],
      true,
      false,
    );
    return ok(patched.newDocument);
  } catch (error) {
    const { index, message } = error as { index?: number; message: string };
    return fail([{ path: `patch[${index ?? 0}]`, message: message.split("\n")[0] ?? message }]);
  }
};
