import { describe, expect, it } from "vitest";
import graphJson from "../../examples/oauth-login/graph.json" with { type: "json" };
import storyboardJson from "../../examples/oauth-login/storyboard.json" with { type: "json" };
import { orThrow } from "./errors.ts";
import { type Graph, parseGraph } from "./graph.ts";
import { staleBeats } from "./stale.ts";
import { parseStoryboard } from "./storyboard.ts";

const graph = orThrow(parseGraph(graphJson), "graph.json");
const storyboard = orThrow(parseStoryboard(storyboardJson, graph), "storyboard.json");

/** The beats whose actions name `id`, read from the example by hand. */
const beatsNaming = (id: string) =>
  storyboard.scenes
    .flatMap((s) => s.beats)
    .filter((b) =>
      b.actions.some(
        (a) =>
          ("node" in a && a.node === id) ||
          ("edge" in a && a.edge === id) ||
          ("except" in a && a.except.includes(id)),
      ),
    )
    .map((b) => b.id);

describe("staleBeats", () => {
  it("finds nothing stale when the graph is the same", () => {
    expect(staleBeats(graph, graph, storyboard)).toEqual([]);
  });

  it("marks the beats whose actions name a node that changed", () => {
    const renamed: Graph = {
      ...graph,
      nodes: graph.nodes.map((n) => (n.id === "idp" ? { ...n, label: "Google" } : n)),
    };
    expect(staleBeats(graph, renamed, storyboard)).toEqual(beatsNaming("idp"));
    expect(beatsNaming("idp").length).toBeGreaterThan(0);
  });

  it("finds nothing stale when only colours change: the script does not depend on them", () => {
    const recoloured: Graph = {
      ...graph,
      nodes: graph.nodes.map((n) => (n.id === "idp" ? { ...n, category: "c3" } : n)),
      edges: graph.edges.map((e, i) => (i === 0 ? { ...e, category: "muted" } : e)),
    };
    expect(staleBeats(graph, recoloured, storyboard)).toEqual([]);
  });

  it("marks the beats that flow an edge that changed or was removed", () => {
    const edge = storyboard.scenes[0]?.beats
      .flatMap((b) => b.actions)
      .find((a) => a.type === "flow");
    if (edge?.type !== "flow") throw new Error("the example flows an edge");
    const without: Graph = { ...graph, edges: graph.edges.filter((e) => e.id !== edge.edge) };
    expect(staleBeats(graph, without, storyboard)).toEqual(beatsNaming(edge.edge));
  });

  it("leaves beats alone when only a node they do not name changes", () => {
    const added: Graph = {
      ...graph,
      nodes: [...graph.nodes, { id: "cache", label: "Cache", kind: "database" }],
    };
    expect(staleBeats(graph, added, storyboard)).toEqual([]);
  });
});
