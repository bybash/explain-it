/**
 * The outcome of something that can fail in an expected way. Expected
 * failures are values, not exceptions; see AGENTS.md (Code rules).
 */
export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly E[] };

export const ok = <T>(value: T): { readonly ok: true; readonly value: T } => ({ ok: true, value });

export const fail = <E>(
  errors: readonly E[],
): { readonly ok: false; readonly errors: readonly E[] } => ({
  ok: false,
  errors,
});
