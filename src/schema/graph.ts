import { z } from "zod";
import { IdSchema, referenceErrors, SchemaKeySchema } from "./common.ts";

/** Words Mermaid reads as syntax at the start of a line or as a node; a node or zone named one breaks the diagram. */
export const MERMAID_KEYWORDS = [
  "end",
  "graph",
  "flowchart",
  "subgraph",
  "direction",
  "style",
  "class",
  "classdef",
  "click",
  "linkstyle",
  "default",
  "call",
  "href",
  "callback",
] as const;

/**
 * The keywords that break `from id@--> to` when they name an edge, found by
 * the pinned Mermaid (src/server/mermaid.test.ts). The rest, such as
 * "click", name an edge without trouble.
 */
export const MERMAID_EDGE_KEYWORDS = [
  "end",
  "graph",
  "flowchart",
  "subgraph",
  "style",
  "class",
  "default",
] as const satisfies readonly (typeof MERMAID_KEYWORDS)[number][];

/** An edge id: written in the graph's Mermaid, so not a keyword that breaks an edge there. */
const EdgeIdSchema = IdSchema.refine(
  (id) => !(MERMAID_EDGE_KEYWORDS as readonly string[]).includes(id),
  {
    error: (issue) =>
      `"${String(issue.input)}" is a Mermaid keyword that cannot name an edge; use another id`,
  },
);

/** A node or zone id: also shown in the graph's Mermaid, so not one of its keywords. */
const DiagramIdSchema = IdSchema.refine(
  (id) => !(MERMAID_KEYWORDS as readonly string[]).includes(id),
  { error: (issue) => `"${String(issue.input)}" is a Mermaid keyword; use another id` },
);

import { parseWith, type Validated } from "./errors.ts";
import { lucideIcon } from "./icons.ts";
import { fail } from "./result.ts";

export const MAX_GRAPH_NODES = 36;
export const MAX_NODE_LABEL = 24;
export const MAX_TITLE = 80;

export const NODE_KINDS = [
  "actor",
  "service",
  "database",
  "queue",
  "document",
  "decision",
  "external",
] as const;

const CategorySchema = z
  .string()
  .regex(/^[a-z][a-z0-9_-]*$/, { error: "must be a palette category name like accent or c1" })
  .describe(
    "A palette category name; a node's defaults by its kind, an edge's and a zone's to the accent.",
  );

export const GraphNodeSchema = z.strictObject({
  id: DiagramIdSchema.describe("Stable id, used by edges, zones and the storyboard."),
  label: z.string().min(1).max(MAX_NODE_LABEL).describe("Shown on the node top."),
  kind: z.enum(NODE_KINDS).describe("Sets the default size, height and colour."),
  icon: z.string().min(1).optional().describe("A Lucide icon name."),
  zone: IdSchema.optional().describe("The id of the zone the node sits in."),
  category: CategorySchema.optional(),
});

export const GraphEdgeSchema = z.strictObject({
  id: EdgeIdSchema,
  from: IdSchema.describe("A node id."),
  to: IdSchema.describe("A node id."),
  label: z.string().min(1).max(MAX_NODE_LABEL).optional(),
  category: CategorySchema.optional(),
});

export const ZoneSchema = z.strictObject({
  id: DiagramIdSchema,
  label: z.string().min(1).max(MAX_NODE_LABEL),
  category: CategorySchema.optional(),
});

export const GraphSchema = z
  .strictObject({
    $schema: SchemaKeySchema,
    version: z.literal(1),
    title: z.string().min(1).max(MAX_TITLE),
    nodes: z.array(GraphNodeSchema).min(1).max(MAX_GRAPH_NODES),
    edges: z.array(GraphEdgeSchema),
    zones: z.array(ZoneSchema).describe("Groups of nodes; Mermaid subgraphs."),
  })
  .describe("The structure of a flow. Mermaid is generated from it.");

export type Graph = z.output<typeof GraphSchema>;
export type GraphNode = z.output<typeof GraphNodeSchema>;
export type GraphEdge = z.output<typeof GraphEdgeSchema>;
export type NodeKind = (typeof NODE_KINDS)[number];

/** Validates shape first, then that every reference points at something real. */
export const parseGraph = (data: unknown): Validated<Graph> => {
  const shape = parseWith(GraphSchema, data);
  if (!shape.ok) return shape;
  const errors = graphReferenceErrors(shape.value);
  return errors.length === 0 ? shape : fail(errors);
};

const graphReferenceErrors = (graph: Graph) => {
  const { errors, add } = referenceErrors();
  const seen = new Set<string>();
  const unique = (id: string, path: readonly PropertyKey[]) => {
    if (seen.has(id)) add(path, `duplicate id "${id}"`);
    seen.add(id);
  };
  graph.nodes.forEach((node, i) => {
    unique(node.id, ["nodes", i, "id"]);
  });
  graph.edges.forEach((edge, i) => {
    unique(edge.id, ["edges", i, "id"]);
  });
  graph.zones.forEach((zone, i) => {
    unique(zone.id, ["zones", i, "id"]);
  });

  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const zoneIds = new Set(graph.zones.map((zone) => zone.id));
  graph.nodes.forEach((node, i) => {
    if (node.icon !== undefined && lucideIcon(node.icon) === undefined)
      add(["nodes", i, "icon"], `unknown Lucide icon "${node.icon}"`);
    if (node.zone !== undefined && !zoneIds.has(node.zone))
      add(["nodes", i, "zone"], `unknown zone "${node.zone}"`);
  });
  graph.edges.forEach((edge, i) => {
    if (!nodeIds.has(edge.from)) add(["edges", i, "from"], `unknown node "${edge.from}"`);
    if (!nodeIds.has(edge.to)) add(["edges", i, "to"], `unknown node "${edge.to}"`);
  });
  return errors;
};
