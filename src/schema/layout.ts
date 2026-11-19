import { z } from "zod";
import { IdSchema, referenceErrors, SchemaKeySchema } from "./common.ts";
import { parseWith, type Validated } from "./errors.ts";
import type { Graph } from "./graph.ts";
import { fail } from "./result.ts";

/** A point on the floor, in grid units. */
export const FloorPointSchema = z.strictObject({ x: z.number(), y: z.number() });

export const LayoutSchema = z
  .strictObject({
    $schema: SchemaKeySchema,
    version: z.literal(1),
    positions: z
      .record(IdSchema, FloorPointSchema)
      .describe("Where each node's footprint starts, snapped to the half-unit grid."),
    overrides: z
      .record(IdSchema, FloorPointSchema)
      .describe("Positions set by hand. They always win over computed ones."),
    routes: z
      .record(IdSchema, z.array(FloorPointSchema).min(2).nullable())
      .describe(
        "Each edge's path, in horizontal and vertical segments; null when an end was overridden.",
      ),
  })
  .describe("Computed positions and edge routes for a graph.");

export type Layout = z.output<typeof LayoutSchema>;
export type FloorPoint = z.output<typeof FloorPointSchema>;

/**
 * Validates shape first, then that the layout covers exactly the graph's
 * nodes and edges, then that it is not stale against its own overrides.
 */
export const parseLayout = (data: unknown, graph: Graph): Validated<Layout> => {
  const shape = parseWith(LayoutSchema, data);
  if (!shape.ok) return shape;
  const { errors, add } = referenceErrors();
  const layout = shape.value;
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const edgeIds = new Set(graph.edges.map((edge) => edge.id));

  for (const node of graph.nodes) {
    if (!(node.id in layout.positions))
      add(["positions", node.id], `missing position for node "${node.id}"`);
  }
  for (const id of Object.keys(layout.positions)) {
    if (!nodeIds.has(id)) add(["positions", id], `unknown node "${id}"`);
  }
  for (const id of Object.keys(layout.overrides)) {
    if (!nodeIds.has(id)) add(["overrides", id], `unknown node "${id}"`);
  }
  for (const edge of graph.edges) {
    if (!(edge.id in layout.routes))
      add(["routes", edge.id], `missing route for edge "${edge.id}"`);
  }
  for (const id of Object.keys(layout.routes)) {
    if (!edgeIds.has(id)) add(["routes", id], `unknown edge "${id}"`);
  }
  if (errors.length > 0) return fail(errors);

  // Stale: overrides must have been applied, and routes to overridden nodes dropped.
  for (const [id, override] of Object.entries(layout.overrides)) {
    const position = layout.positions[id];
    if (position && (position.x !== override.x || position.y !== override.y))
      add(["positions", id], "differs from its override, so the layout is stale");
  }
  for (const edge of graph.edges) {
    const overridden = [edge.from, edge.to].find((id) => id in layout.overrides);
    if (overridden !== undefined && layout.routes[edge.id] !== null)
      add(
        ["routes", edge.id],
        `must be null while "${overridden}" is overridden, so the layout is stale`,
      );
  }
  return errors.length === 0 ? shape : fail(errors);
};
