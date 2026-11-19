import { z } from "zod";
import type { ValidationError } from "./errors.ts";
import { formatPath } from "./errors.ts";

export const MAX_ID_LENGTH = 40;

/** Ids are stable across edits and safe in file names, URLs and Mermaid. */
export const IdSchema = z
  .string()
  .max(MAX_ID_LENGTH)
  .regex(/^[a-z][a-z0-9_]*$/, {
    error: "must start with a lowercase letter and use only a-z, 0-9 and _",
  });

/**
 * Collects reference errors in order. Used after the shape is valid, so
 * callers can index freely.
 */
export const referenceErrors = () => {
  const errors: ValidationError[] = [];
  return {
    errors,
    add: (path: readonly PropertyKey[], message: string) => {
      errors.push({ path: formatPath(path), message });
    },
  };
};

/**
 * `$schema` points editors at the JSON Schema for completion and checking.
 * explAIn-it ignores it; every other unknown key is still an error.
 */
export const SchemaKeySchema = z
  .string()
  .optional()
  .describe("The JSON Schema for this file, for editors. Ignored by explAIn-it.");
