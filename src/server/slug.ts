import { MAX_SLUG } from "../schema/common.ts";

const FALLBACK = "project";

/** Letters that Unicode normalisation does not take apart into a base letter and an accent. */
const LETTERS: Readonly<Record<string, string>> = {
  ß: "ss",
  æ: "ae",
  œ: "oe",
  ø: "o",
  ł: "l",
  đ: "d",
  þ: "th",
};

/** Cuts a slug to `max` characters, at a hyphen when there is one, never ending on one. */
const cut = (slug: string, max: number): string => {
  if (slug.length <= max) return slug;
  const head = slug.slice(0, max);
  const hyphen = head.lastIndexOf("-");
  return (hyphen > 0 ? head.slice(0, hyphen) : head).replace(/-+$/, "");
};

/**
 * A project's folder name from its name: lower-case ASCII words joined by
 * hyphens, at most 60 characters. When the slug is already `taken`, a
 * number is added: `-2`, `-3` and so on.
 */
export const slugify = (name: string, taken: readonly string[]): string => {
  const base =
    cut(
      name
        .toLowerCase()
        .replace(/[ßæœøłđþ]/g, (letter) => LETTERS[letter] ?? letter)
        .normalize("NFKD")
        .replace(/\p{M}/gu, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
      MAX_SLUG,
    ) || FALLBACK;
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const slug = `${cut(base, MAX_SLUG - suffix.length)}${suffix}`;
    if (!used.has(slug)) return slug;
  }
};
