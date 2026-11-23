import { type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode, useId } from "react";

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

/** A small rounded button for a secondary action: a moment in the preview, a sample, another take. */
export const Pill = ({ className = "", ...button }: ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    type="button"
    className={`rounded-full border border-line px-3 py-1 text-sm hover:border-accent disabled:opacity-60 ${className}`}
    {...button}
  />
);

export type Tab<Id extends string> = {
  readonly id: Id;
  readonly label: string;
  /** Marked beside the label, such as changes not saved yet. */
  readonly marked?: boolean;
  readonly content: ReactNode;
};

/**
 * Tabs, as the ARIA pattern has them: the arrow keys move between tabs, and
 * every panel stays mounted (hidden when not chosen), so what a panel holds,
 * such as a picked file, is kept across a switch.
 */
export const Tabs = <Id extends string>({
  label,
  tabs,
  selected,
  select,
}: {
  label: string;
  tabs: readonly Tab<Id>[];
  selected: Id;
  select: (id: Id) => void;
}) => {
  const base = useId();
  const tabId = (id: Id) => `${base}-tab-${id}`;
  const panelId = (id: Id) => `${base}-panel-${id}`;
  const step = (event: KeyboardEvent, by: number) => {
    const at = tabs.findIndex((t) => t.id === selected);
    const next = tabs[(at + by + tabs.length) % tabs.length];
    if (!next) return;
    event.preventDefault();
    select(next.id);
    document.getElementById(tabId(next.id))?.focus();
  };
  return (
    <div>
      <div role="tablist" aria-label={label} className="flex gap-1 border-line border-b">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            id={tabId(tab.id)}
            type="button"
            role="tab"
            aria-selected={tab.id === selected}
            aria-controls={panelId(tab.id)}
            tabIndex={tab.id === selected ? 0 : -1}
            className="-mb-px border-transparent border-b-2 px-4 py-2 font-semibold text-muted hover:text-ink aria-selected:border-accent aria-selected:text-accent"
            onClick={() => select(tab.id)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") step(e, 1);
              if (e.key === "ArrowLeft") step(e, -1);
            }}
          >
            {tab.label}
            {tab.marked && (
              <span className="ml-1.5 text-accent" title="Unsaved changes">
                •
              </span>
            )}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          id={panelId(tab.id)}
          role="tabpanel"
          aria-labelledby={tabId(tab.id)}
          hidden={tab.id !== selected}
          className="pt-4"
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
};
