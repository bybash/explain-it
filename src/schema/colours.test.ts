import { describe, expect, it } from "vitest";
import graphJson from "../../examples/oauth-login/graph.json" with { type: "json" };
import { applyColours, parseColourChange } from "./colours.ts";
import { formatErrors, orThrow } from "./errors.ts";
import { parseGraph } from "./graph.ts";

const graph = orThrow(parseGraph(graphJson), "graph.json");
const node = (g: typeof graph, id: string) => g.nodes.find((n) => n.id === id);

describe("applyColours", () => {
  it("sets the category of the nodes, edges and zones it names, and nothing else", () => {
    const coloured = applyColours(graph, {
      nodes: { idp: "c3" },
      edges: { login: "muted" },
      zones: { backend: "c6" },
    });
    expect(coloured.ok).toBe(true);
    if (!coloured.ok) return;
    expect(node(coloured.value, "idp")).toEqual({ ...node(graph, "idp"), category: "c3" });
    expect(coloured.value.edges.find((e) => e.id === "login")?.category).toBe("muted");
    expect(coloured.value.zones.find((z) => z.id === "backend")?.category).toBe("c6");
    expect(coloured.value.nodes.filter((n) => n.id !== "idp")).toEqual(
      graph.nodes.filter((n) => n.id !== "idp"),
    );
  });

  it("gives back the default colour for null: the node's kind's, or the accent", () => {
    const coloured = orThrow(applyColours(graph, { nodes: { idp: "c3" } }), "colours");
    const reset = orThrow(applyColours(coloured, { nodes: { idp: null } }), "colours");
    expect(node(reset, "idp")).toEqual(node(graph, "idp"));
    expect(node(reset, "idp")).not.toHaveProperty("category");
  });

  it("refuses an id the graph does not have, naming its place", () => {
    const coloured = applyColours(graph, { nodes: { ghost: "c1" }, zones: { idp: "c1" } });
    expect(coloured.ok ? [] : formatErrors(coloured.errors)).toEqual([
      'nodes.ghost: no node "ghost" in the graph',
      'zones.idp: no zone "idp" in the graph',
    ]);
  });
});

describe("parseColourChange", () => {
  it("takes only the palette's categories", () => {
    const change = parseColourChange({ nodes: { idp: "pink" } });
    expect(change.ok ? [] : formatErrors(change.errors)[0]).toMatch(/^nodes\.idp: /);
    expect(parseColourChange({ edges: { login: "c2" }, zones: { backend: null } }).ok).toBe(true);
  });
});
