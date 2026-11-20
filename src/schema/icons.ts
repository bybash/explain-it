import { type IconNode, icons } from "lucide";

export type { IconNode };

/** `shield-check` → `ShieldCheck`, `clock-10` → `Clock10`: how lucide keys its icons. */
const exportName = (name: string): string =>
  name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");

/**
 * The drawing of a Lucide icon, by the kebab-case name lucide.dev shows, or
 * undefined when Lucide has no such icon. Graph validation and the engine
 * both use it, so a name that validates always draws.
 */
export const lucideIcon = (name: string): IconNode | undefined => {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) return undefined;
  const key = exportName(name);
  const byName: Readonly<Record<string, IconNode>> = icons;
  return Object.hasOwn(byName, key) ? byName[key] : undefined;
};
