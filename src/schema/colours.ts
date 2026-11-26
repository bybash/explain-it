import { z } from "zod";
import { MAX_CATEGORY_COLOURS } from "./config.ts";
import { parseWith, type Validated, type ValidationError } from "./errors.ts";
import type { Graph } from "./graph.ts";
import { fail, ok } from "./result.ts";

/** The category of anything that does not name one and has no kind: edges and zones. */
export const DEFAULT_CATEGORY = "accent";

/** The palette's numbered category colours, c1 to c6. */
export const NUMBERED_CATEGORIES = Array.from(
  { length: MAX_CATEGORY_COLOURS },
  (_, i) => `c${i + 1}`,
);

/** Every category a node, edge or zone can name; an unknown one draws in the accent. */
export const CATEGORIES = [DEFAULT_CATEGORY, "muted", ...NUMBERED_CATEGORIES] as const;
export type Category = (typeof CATEGORIES)[number];

/** A category's colour in each mode. */
export type CategoryColour = { readonly light: string; readonly dark: string };

/** What each category looks like in a palette: what `get_project` gives agents as `colours`. */
export type ColourTable = Readonly<Record<Category, CategoryColour>>;

const ColoursOfSchema = (what: string) =>
  z
    .record(z.string(), z.enum(CATEGORIES).nullable())
    .optional()
    .describe(`${what} ids to a category, or null for the default colour.`);

/**
 * A change of colours (SPEC, Graph): a category for the nodes, edges and
 * zones it names, or null to give back the default (a node's kind's, or the
 * accent). The Style gate's Colours tab saves one.
 */
export const ColourChangeSchema = z.strictObject({
  nodes: ColoursOfSchema("Node"),
  edges: ColoursOfSchema("Edge"),
  zones: ColoursOfSchema("Zone"),
});
export type ColourChange = z.output<typeof ColourChangeSchema>;

export const parseColourChange = (data: unknown): Validated<ColourChange> =>
  parseWith(ColourChangeSchema, data);

type Coloured = { readonly id: string; readonly category?: string | undefined };

const recoloured = <T extends Coloured>(items: readonly T[], colours: ColourChange["nodes"]): T[] =>
  items.map((item) => {
    if (colours === undefined || !(item.id in colours)) return item;
    const { category: _category, ...rest } = item;
    const category = colours[item.id];
    return (category ? { ...rest, category } : rest) as T;
  });

/**
 * A graph with only its colours changed. An id the graph does not have is an
 * error, so a colour is never set on something that is gone.
 */
export const applyColours = (graph: Graph, change: ColourChange): Validated<Graph> => {
  const errors: ValidationError[] = [];
  const check = (part: "nodes" | "edges" | "zones", noun: string, items: readonly Coloured[]) => {
    const ids = new Set(items.map((item) => item.id));
    for (const id of Object.keys(change[part] ?? {}))
      if (!ids.has(id))
        errors.push({ path: `${part}.${id}`, message: `no ${noun} "${id}" in the graph` });
  };
  check("nodes", "node", graph.nodes);
  check("edges", "edge", graph.edges);
  check("zones", "zone", graph.zones);
  if (errors.length > 0) return fail(errors);
  return ok({
    ...graph,
    nodes: recoloured(graph.nodes, change.nodes),
    edges: recoloured(graph.edges, change.edges),
    zones: recoloured(graph.zones, change.zones),
  });
};
