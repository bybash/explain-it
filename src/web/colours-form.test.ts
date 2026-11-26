import { describe, expect, it } from "vitest";
import graphJson from "../../examples/oauth-login/graph.json" with { type: "json" };
import { applyColours } from "../schema/colours.ts";
import { orThrow } from "../schema/errors.ts";
import { parseGraph } from "../schema/graph.ts";
import { colourChange, colouredGraph, NO_COLOURS, settled, withPick } from "./colours-form.ts";

const graph = orThrow(parseGraph(graphJson), "graph.json");
const recolour = (nodes: Record<string, string | null>) =>
  orThrow(applyColours(graph, { nodes }), "colours");

describe("the Colours tab's draft", () => {
  it("changes what was picked, and the preview draws it", () => {
    const draft = withPick(NO_COLOURS, graph, "nodes", "idp", "c4");
    expect(colourChange(graph, draft)).toEqual({ nodes: { idp: "c4" } });
    expect(colouredGraph(graph, draft).nodes.find((n) => n.id === "idp")?.category).toBe("c4");
  });

  it("changes nothing for a pick back to what is saved", () => {
    const there = withPick(NO_COLOURS, graph, "nodes", "idp", "c4");
    const back = withPick(there, graph, "nodes", "idp", null);
    expect(colourChange(graph, back)).toEqual({});
  });

  it("drops a pick once it is saved, and one whose colour changed elsewhere, saying so", () => {
    const draft = withPick(
      withPick(NO_COLOURS, graph, "nodes", "idp", "c4"),
      graph,
      "nodes",
      "user",
      "c2",
    );
    const after = settled(recolour({ idp: "c4", user: "c6" }), draft);
    expect(after.draft).toEqual(NO_COLOURS);
    expect(after.lost).toEqual(["user"]);
  });

  it("drops a pick for something no longer in the graph", () => {
    const draft = withPick(NO_COLOURS, graph, "nodes", "idp", "c4");
    const gone = { ...graph, nodes: graph.nodes.filter((n) => n.id !== "idp") };
    expect(colourChange(gone, draft)).toEqual({});
    expect(settled(gone, draft).draft).toEqual(NO_COLOURS);
  });

  it("keeps a pick the graph has not reached yet", () => {
    const draft = withPick(NO_COLOURS, graph, "nodes", "idp", "c4");
    expect(settled(graph, draft)).toEqual({ draft, lost: [] });
  });
});
