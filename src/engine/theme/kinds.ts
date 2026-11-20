import type { NodeKind } from "../../schema/graph.ts";

/** The category of anything that does not name one and has no kind: edges and zones. */
export const DEFAULT_CATEGORY = "accent";

/** The style attribute that colours an element with its category; unknown ones fall back to the accent. */
export const categoryStyle = (category: string): string =>
  `--cat: var(--cat-${category}, var(--cat-${DEFAULT_CATEGORY}))`;

export type KindStyle = {
  /** A palette category: accent, muted or c1 to c6. */
  readonly category: string;
  /** A Lucide icon name. */
  readonly icon: string;
};

/** What a node looks like when the graph does not say. */
export const KIND_STYLES: Readonly<Record<NodeKind, KindStyle>> = {
  actor: { category: "c1", icon: "user" },
  service: { category: "accent", icon: "server" },
  database: { category: "c2", icon: "database" },
  queue: { category: "c3", icon: "layers" },
  document: { category: "muted", icon: "file-text" },
  decision: { category: "c4", icon: "split" },
  external: { category: "c5", icon: "globe" },
};
