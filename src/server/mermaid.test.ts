import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import graphJson from "../../examples/oauth-login/graph.json" with { type: "json" };
import { graphToMermaid } from "../mermaid/generate.ts";
import {
  type Graph,
  MAX_NODE_LABEL,
  MERMAID_EDGE_KEYWORDS,
  MERMAID_KEYWORDS,
  NODE_KINDS,
  parseGraph,
} from "../schema/graph.ts";
import { mermaidToGraph } from "./mermaid.ts";

const parsed = parseGraph(graphJson);
if (!parsed.ok) throw new Error("the example graph is invalid");
const example = parsed.value;
const { $schema: _schema, ...exampleWithoutSchema } = example;

describe("mermaidToGraph, with the pinned mermaid", () => {
  it("reads the example's Mermaid back to the same graph", async () => {
    const result = await mermaidToGraph(graphToMermaid(example), example);
    expect(result).toEqual({ ok: true, value: { graph: exampleWithoutSchema, notes: [] } });
  });

  it("reads back every graph the generator writes, labels with Mermaid's own syntax included", async () => {
    const id = fc
      .stringMatching(/^[a-z][a-z0-9_]{0,7}$/)
      // Edge ids are e0, e1…; a node may not share one.
      .filter(
        (candidate) =>
          !(MERMAID_KEYWORDS as readonly string[]).includes(candidate) && !/^e\d+$/.test(candidate),
      );
    // Printable text with the characters Mermaid reads as syntax, trimmed as labels are.
    const label = fc
      .string({
        unit: fc.constantFrom(..."ab Z9#\"|<>`&;:()[]{}-_./'é→"),
        minLength: 1,
        maxLength: MAX_NODE_LABEL,
      })
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const graphs = fc
      .uniqueArray(id, { minLength: 1, maxLength: 8 })
      .chain((ids) =>
        fc.record({
          version: fc.constant(1 as const),
          title: fc.constant("Random"),
          nodes: fc.tuple(
            ...ids.map((nodeId, i) =>
              fc.record({
                id: fc.constant(nodeId),
                label,
                kind: fc.constantFrom(...NODE_KINDS),
                zone: fc.constant(i % 3 === 0 ? "zone_a" : undefined),
              }),
            ),
          ),
          edges: fc
            .array(fc.tuple(fc.constantFrom(...ids), fc.constantFrom(...ids), fc.option(label)), {
              maxLength: 6,
            })
            .map((list) =>
              list.map(([from, to, edgeLabel], i) =>
                edgeLabel === null
                  ? { id: `e${i}`, from, to }
                  : { id: `e${i}`, from, to, label: edgeLabel },
              ),
            ),
          zones: fc.constant([{ id: "zone_a", label: "Zone A" }]),
        }),
      )
      .map(
        (g): Graph => ({
          version: 1,
          title: "Random",
          nodes: g.nodes.map(({ zone, ...n }) => (zone ? { ...n, zone } : n)),
          edges: g.edges.map((e) => ({ ...e })),
          zones: [{ id: "zone_a", label: "Zone A" }],
        }),
      );
    await fc.assert(
      fc.asyncProperty(graphs, async (graph) => {
        // With the graph it came from, it comes back the same; without, in the generator's order.
        expect(await mermaidToGraph(graphToMermaid(graph), graph)).toEqual({
          ok: true,
          value: { graph, notes: [] },
        });
        const alone = await mermaidToGraph(graphToMermaid(graph));
        const byId = (g: Graph) => [...g.nodes].sort((a, b) => a.id.localeCompare(b.id));
        expect(alone.ok && byId(alone.value.graph)).toEqual(byId(graph));
      }),
      { numRuns: 60 },
    );
  }, 60_000);

  it("reads an edge named by any keyword the schema allows; the ones it refuses do break", async () => {
    const failed: string[] = [];
    for (const keyword of MERMAID_KEYWORDS) {
      const graph: Graph = {
        version: 1,
        title: "Keywords",
        nodes: [
          { id: "a", label: "A", kind: "service" },
          { id: "b", label: "B", kind: "service" },
        ],
        edges: [{ id: keyword, from: "a", to: "b" }],
        zones: [],
      };
      const back = await mermaidToGraph(graphToMermaid(graph), graph);
      if (!back.ok) failed.push(keyword);
      else expect(back.value.graph).toEqual(graph);
    }
    // Exactly the keywords that break an edge in Mermaid are the ones the schema refuses.
    expect(failed).toEqual([...MERMAID_EDGE_KEYWORDS]);
  });

  it("reads a diagram written by hand, keeping what fits and naming the rest", async () => {
    const text = readFileSync(
      new URL("../mermaid/fixtures/hand-written.mmd", import.meta.url),
      "utf8",
    );
    const result = await mermaidToGraph(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { graph, notes } = result.value;
    expect(graph.title).toBe("Checkout");
    expect(graph.nodes.map((n) => [n.id, n.label, n.kind, n.zone ?? null])).toEqual([
      ["shopper", "Shopper", "actor", null],
      ["cart", "Cart service", "service", "shop"],
      ["stock", "Stock DB", "database", "shop"],
      ["psp", "Payment provider", "external", null],
      ["hook", "Webhook", "document", null],
      ["orders", "Order queue", "queue", "shop"],
      ["ok", "Paid?", "decision", null],
    ]);
    expect(graph.edges.map((e) => [e.id, e.from, e.to, e.label ?? null])).toEqual([
      ["shopper_to_cart", "shopper", "cart", null],
      ["cart_to_stock", "cart", "stock", "reserve"],
      ["cart_to_psp", "cart", "psp", "pay #1"],
      ["psp_to_hook", "psp", "hook", null],
      ["hook_to_orders", "hook", "orders", null],
      ["orders_to_ok", "orders", "ok", null],
    ]);
    expect(graph.zones).toEqual([{ id: "shop", label: "Our shop" }]);
    expect(notes).toEqual([
      "line 17: style is not kept; colours come from the palette",
      "line 18: click is not kept; the video has no links",
      "edge cart --> psp: a dotted line is drawn as a plain arrow",
      "edge hook --> orders: a thick line is drawn as a plain arrow",
    ]);
  });

  it("names the line Mermaid cannot read", async () => {
    const result = await mermaidToGraph("flowchart LR\n  a --> b\n  b -->\n");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.path).toBe("line 3");
  });

  it("refuses a diagram that is not a flowchart, and text that is no diagram", async () => {
    expect(await mermaidToGraph("sequenceDiagram\n  a->>b: hi\n")).toEqual({
      ok: false,
      errors: [
        {
          path: "(diagram)",
          message: "a sequence diagram: only a flowchart (or graph) becomes the graph",
        },
      ],
    });
    const none = await mermaidToGraph("hello there");
    expect(none.ok).toBe(false);
  });

  it("leaves the server's own globals alone", async () => {
    await mermaidToGraph("flowchart LR\n  a --> b");
    expect("window" in globalThis).toBe(false);
    expect("document" in globalThis).toBe(false);
  });
});
