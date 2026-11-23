import type { ReactNode } from "react";

/** The pieces every page repeats, so their look is said once. */

export const PageTitle = ({ children }: { children: ReactNode }) => (
  <h1 className="mb-2 font-bold text-2xl">{children}</h1>
);

/** A heading inside a page: a gate's name, or a part of its panel. */
export const SectionTitle = ({ level, children }: { level: 2 | 3; children: ReactNode }) => {
  const Heading = level === 2 ? "h2" : "h3";
  return <Heading className="mt-8 mb-3 font-bold text-base">{children}</Heading>;
};

/** A paragraph of secondary text: loading, empty states, what a panel will show. */
export const Muted = ({ children }: { children: ReactNode }) => (
  <p className="my-4 text-muted">{children}</p>
);

/** A bordered box of rows, one per item: projects, a project's files. */
export const BoxList = ({ label, children }: { label?: string; children: ReactNode }) => (
  <ul
    className="divide-y divide-line overflow-hidden rounded-box border border-line bg-surface"
    aria-label={label}
  >
    {children}
  </ul>
);
