import { applyColours, type ColourChange } from "../schema/colours.ts";
import type { Graph } from "../schema/graph.ts";

/** The parts of a graph that take a colour, as a colour change names them. */
export const COLOURED_PARTS = ["nodes", "edges", "zones"] as const;
export type ColouredPart = (typeof COLOURED_PARTS)[number];

/** The colours picked in the tab: for each part, an id's category, or null for its default. */
export type ColourDraft = Readonly<Record<ColouredPart, Readonly<Record<string, string | null>>>>;

export const NO_COLOURS: ColourDraft = { nodes: {}, edges: {}, zones: {} };

/**
 * What the draft changes in the graph as it now is: picks for ids that are
 * gone, or that the graph already has, are left out, so a graph changed
 * elsewhere (over MCP, in the chat) never makes a save fail.
 */
export const colourChange = (graph: Graph, draft: ColourDraft): ColourChange => {
  const change: Record<string, Record<string, string | null>> = {};
  for (const part of COLOURED_PARTS) {
    const saved = new Map<string, string | null>(
      graph[part].map((item) => [item.id, item.category ?? null]),
    );
    const kept = Object.entries(draft[part]).filter(
      ([id, category]) => saved.has(id) && saved.get(id) !== category,
    );
    if (kept.length > 0) change[part] = Object.fromEntries(kept);
  }
  return change as ColourChange;
};

/** Whether a colour change changes anything. */
export const changesColours = (change: ColourChange): boolean =>
  COLOURED_PARTS.some((part) => Object.keys(change[part] ?? {}).length > 0);

/** The graph with the draft's colours, for the preview; the graph as it is if they do not apply. */
export const colouredGraph = (graph: Graph, draft: ColourDraft): Graph => {
  const coloured = applyColours(graph, colourChange(graph, draft));
  return coloured.ok ? coloured.value : graph;
};
