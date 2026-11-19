import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatErrors } from "../schema/errors.ts";
import { type Graph, parseGraph } from "../schema/graph.ts";
import type { Layout } from "../schema/layout.ts";
import { footprints, layoutProblems } from "./layout.testing.ts";
import { GRID, layoutGraph } from "./layout.ts";

const example = ((): Graph => {
  const json = readFileSync(
    new URL("../../examples/oauth-login/graph.json", import.meta.url),
    "utf8",
  );
  const result = parseGraph(JSON.parse(json));
  if (!result.ok) throw new Error("example graph is invalid");
  return result.value;
})();

const laidOut = async (graph: Graph, overrides: Layout["overrides"] = {}): Promise<Layout> => {
  const result = await layoutGraph(graph, overrides);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.value;
};

describe("layoutGraph", () => {
  it("places every node of the example on the grid, with no layout problems", async () => {
    const layout = await laidOut(example);
    const boxes = footprints(example, layout);
    expect([...boxes.keys()].toSorted()).toEqual(example.nodes.map((n) => n.id).toSorted());
    for (const box of boxes.values()) {
      expect(Number.isInteger(box.x / GRID) && Number.isInteger(box.y / GRID)).toBe(true);
    }
    expect(layoutProblems(example, layout)).toEqual([]);
  });

  it("lets overrides win over computed positions", async () => {
    const layout = await laidOut(example, { user: { x: 40, y: 40 } });
    expect(layout.positions.user).toEqual({ x: 40, y: 40 });
    expect(layout.overrides).toEqual({ user: { x: 40, y: 40 } });
    expect(layout.positions.app).toEqual((await laidOut(example)).positions.app);
  });

  it("snaps overrides to the half-unit grid", async () => {
    const layout = await laidOut(example, { browser: { x: 1.3, y: 0.7 } });
    expect(layout.positions.browser).toEqual({ x: 1.5, y: 0.5 });
    expect(layout.overrides).toEqual({ browser: { x: 1.5, y: 0.5 } });
  });

  it("drops the routes of edges touching an overridden node, and only those", async () => {
    const layout = await laidOut(example, { user: { x: 40, y: 40 } });
    const dropped = Object.entries(layout.routes)
      .filter(([, route]) => route === null)
      .map(([id]) => id);
    expect(dropped).toEqual(["click"]);
  });

  it("gives the same layout every time for the same graph", async () => {
    expect(await laidOut(example)).toEqual(await laidOut(example));
  });

  it("names overrides for nodes that do not exist", async () => {
    const result = await layoutGraph(example, { ghost: { x: 1, y: 1 } });
    expect(result.ok ? [] : formatErrors(result.errors)).toEqual([
      'overrides.ghost: unknown node "ghost"',
    ]);
  });
});
