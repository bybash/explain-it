import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseConfig } from "./config.ts";
import { MAX_GRAPH_NODES, parseGraph } from "./graph.ts";
import { parseProject } from "./project.ts";
import { parseStoryboard } from "./storyboard.ts";

const id = fc.stringMatching(/^[a-z][a-z0-9_]{0,11}$/);
const label = fc.string({ minLength: 1, maxLength: 24 });
const kind = fc.constantFrom(
  "actor",
  "service",
  "database",
  "queue",
  "document",
  "decision",
  "external",
);

/** Graphs that are valid by construction: unique ids, edges between existing nodes. */
const validGraph = fc
  .uniqueArray(id, { minLength: 1, maxLength: MAX_GRAPH_NODES })
  .chain((ids) =>
    fc.record({
      version: fc.constant(1),
      title: label,
      nodes: fc.tuple(...ids.map((nodeId) => fc.record({ id: fc.constant(nodeId), label, kind }))),
      edges: fc
        .array(fc.tuple(fc.constantFrom(...ids), fc.constantFrom(...ids)), { maxLength: 20 })
        .map((pairs) => pairs.map(([from, to], i) => ({ id: `edge_${i}`, from, to }))),
      zones: fc.constant([]),
    }),
  );

describe("schema properties", () => {
  it("never throws, whatever the input", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (input) => {
        const graph = parseGraph(input);
        parseConfig(input);
        parseProject(input);
        if (graph.ok) parseStoryboard(input, graph.value);
      }),
    );
  });

  it("accepts every graph that is valid by construction", () => {
    fc.assert(
      fc.property(validGraph, (graph) => {
        const result = parseGraph(graph);
        expect(result.ok ? [] : result.errors).toEqual([]);
      }),
    );
  });

  it("returns errors with a path and a message", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (input) => {
        const result = parseGraph(input);
        if (result.ok) return;
        expect(result.errors.length).toBeGreaterThan(0);
        for (const error of result.errors) {
          expect(error.path).not.toBe("");
          expect(error.message).not.toBe("");
        }
      }),
    );
  });
});
