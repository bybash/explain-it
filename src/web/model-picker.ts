import type { ModelChoice } from "../schema/settings.ts";

/** The picker's entry for a model the list lacks, typed in a box instead (decision 050). */
export const OTHER_MODEL = "other";

/** The picker's entry for `model`: itself when listed, else "another model". */
export const pickedModel = (choices: readonly ModelChoice[], model: string): string =>
  choices.some((c) => c.id === model) ? model : OTHER_MODEL;

/** The choices by family, in the order the list first names each family. */
export const modelGroups = (
  choices: readonly ModelChoice[],
): readonly { readonly family: string; readonly choices: readonly ModelChoice[] }[] => {
  const families = [...new Set(choices.map((c) => c.family))];
  return families.map((family) => ({
    family,
    choices: choices.filter((c) => c.family === family),
  }));
};
