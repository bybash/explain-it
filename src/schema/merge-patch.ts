/**
 * JSON Merge Patch (RFC 7386), as `set_style` and the style gate change
 * `config.json`: objects merge, `null` removes a key, anything else replaces.
 */

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const asObject = (value: unknown): Record<string, unknown> | undefined =>
  isPlainObject(value) ? value : undefined;

/** `changes` laid over `base`. */
export const merged = (base: unknown, changes: unknown): unknown => {
  if (!isPlainObject(changes)) return changes;
  const result: Record<string, unknown> = isPlainObject(base) ? { ...base } : {};
  for (const [key, value] of Object.entries(changes))
    if (value === null) delete result[key];
    else result[key] = merged(result[key], value);
  return result;
};

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * The smallest patch that `merged` lays over `before` to give `after`: only
 * what changed, and `null` for each key `after` no longer has. Both must be
 * JSON without nulls, which a merge patch cannot say.
 */
export const mergePatchBetween = (before: unknown, after: unknown): unknown => {
  if (!isPlainObject(before) || !isPlainObject(after)) return after;
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(before)) if (!(key in after)) patch[key] = null;
  for (const [key, value] of Object.entries(after)) {
    const old = before[key];
    if (same(old, value)) continue;
    patch[key] = isPlainObject(old) && isPlainObject(value) ? mergePatchBetween(old, value) : value;
  }
  return patch;
};
