import { applyColours, type Category, type ColourChange } from "../schema/colours.ts";
import type { Graph } from "../schema/graph.ts";

/** The parts of a graph that take a colour, as a colour change names them. */
export const COLOURED_PARTS = ["nodes", "edges", "zones"] as const;
export type ColouredPart = (typeof COLOURED_PARTS)[number];

/** A pick in the tab: the colour it was (null for the default) and the colour it is to be. */
type Pick = { readonly from: Category | null; readonly to: Category | null };

/** The colours picked in the tab and not saved yet, by part and id. */
export type ColourDraft = Readonly<Record<ColouredPart, Readonly<Record<string, Pick>>>>;

export const NO_COLOURS: ColourDraft = { nodes: {}, edges: {}, zones: {} };

const savedIn = (graph: Graph, part: ColouredPart) =>
  new Map<string, Category | null>(graph[part].map((item) => [item.id, item.category ?? null]));

/** The colour an item shows in the tab: the one picked, or else the one saved (null for the default). */
export const shownColour = (
  draft: ColourDraft,
  part: ColouredPart,
  item: { readonly id: string; readonly category?: string | undefined },
): Category | null =>
  draft[part][item.id]?.to ?? (item.id in draft[part] ? null : (item.category ?? null));

/** The draft with a colour picked for an item; it remembers what the item had, to notice a change made elsewhere. */
export const withPick = (
  draft: ColourDraft,
  graph: Graph,
  part: ColouredPart,
  id: string,
  to: Category | null,
): ColourDraft => {
  const from = draft[part][id]?.from ?? savedIn(graph, part).get(id) ?? null;
  return { ...draft, [part]: { ...draft[part], [id]: { from, to } } };
};

/**
 * What the draft changes in the graph as it now is: only picks for items it
 * still has, as they were when picked, and to another colour than theirs.
 */
export const colourChange = (graph: Graph, draft: ColourDraft): ColourChange => {
  const change: { -readonly [P in ColouredPart]?: Record<string, Category | null> } = {};
  for (const part of COLOURED_PARTS) {
    const saved = savedIn(graph, part);
    const kept = Object.entries(draft[part]).filter(
      ([id, pick]) => saved.has(id) && saved.get(id) === pick.from && pick.to !== pick.from,
    );
    if (kept.length > 0) change[part] = Object.fromEntries(kept.map(([id, p]) => [id, p.to]));
  }
  return change;
};

/** Whether a colour change changes anything. */
export const changesColours = (change: ColourChange): boolean =>
  COLOURED_PARTS.some((part) => Object.keys(change[part] ?? {}).length > 0);

/** The graph with the draft's colours, for the preview. */
export const colouredGraph = (graph: Graph, draft: ColourDraft): Graph => {
  const coloured = applyColours(graph, colourChange(graph, draft));
  return coloured.ok ? coloured.value : graph;
};

/**
 * The draft once the graph has changed: a pick the graph now has, or whose
 * item is gone, is done with; one whose item was recoloured elsewhere is
 * dropped, and its id said in `lost`, so a save never undoes that change.
 */
export const settled = (
  graph: Graph,
  draft: ColourDraft,
): { readonly draft: ColourDraft; readonly lost: readonly string[] } => {
  const lost: string[] = [];
  const next = Object.fromEntries(
    COLOURED_PARTS.map((part) => {
      const saved = savedIn(graph, part);
      const kept = Object.entries(draft[part]).filter(([id, pick]) => {
        if (!saved.has(id) || saved.get(id) === pick.to) return false;
        if (saved.get(id) !== pick.from) {
          lost.push(id);
          return false;
        }
        return true;
      });
      return [part, Object.fromEntries(kept)];
    }),
  ) as Record<ColouredPart, Record<string, Pick>>;
  const same = COLOURED_PARTS.every(
    (part) => Object.keys(next[part]).length === Object.keys(draft[part]).length,
  );
  return { draft: same ? draft : next, lost };
};
