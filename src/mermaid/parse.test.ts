import { describe, expect, it } from "vitest";
import type { Graph } from "../schema/graph.ts";
import {
  type Diagram,
  declarationLine,
  diagramToGraph,
  frontMatterTitle,
  ignoredLines,
  sourceLine,
} from "./parse.ts";

const diagram = (part: Partial<Diagram>): Diagram => ({
  type: "flowchart",
  nodes: [],
  edges: [],
  subgraphs: [],
  ...part,
});

const previous: Graph = {
  version: 1,
  title: "OAuth login",
  nodes: [
    { id: "user", label: "User", kind: "actor", icon: "user", category: "c1" },
    { id: "app", label: "App", kind: "service", icon: "server", zone: "backend" },
  ],
  edges: [{ id: "sign_in", from: "user", to: "app", label: "Sign in", category: "c2" }],
  zones: [{ id: "backend", label: "Your backend", category: "c3" }],
};

describe("diagramToGraph", () => {
  it("reads each kind from its shape, and zones from subgraphs", () => {
    const result = diagramToGraph(
      diagram({
        nodes: [
          { id: "a", label: "A", shape: "stadium" },
          { id: "b", label: "B", shape: "square" },
          { id: "c", label: "C", shape: "cylinder" },
          { id: "d", label: "D", shape: "subroutine" },
          { id: "e", label: "E", shape: "odd" },
          { id: "f", label: "F", shape: "diamond" },
          { id: "g", label: "G", shape: "hexagon" },
        ],
        subgraphs: [{ id: "zone_1", title: "Zone one", members: ["b", "c"] }],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.graph.nodes.map((n) => [n.id, n.kind, n.zone])).toEqual([
      ["a", "actor", undefined],
      ["b", "service", "zone_1"],
      ["c", "database", "zone_1"],
      ["d", "queue", undefined],
      ["e", "document", undefined],
      ["f", "decision", undefined],
      ["g", "external", undefined],
    ]);
    expect(result.value.graph.zones).toEqual([{ id: "zone_1", label: "Zone one" }]);
    expect(result.value.notes).toEqual([]);
  });

  it("keeps what Mermaid cannot say from the previous graph, matched by id", () => {
    const result = diagramToGraph(
      diagram({
        nodes: [
          { id: "user", label: "Person", shape: "stadium" },
          { id: "app", label: "App", shape: "square" },
        ],
        edges: [{ from: "user", to: "app", label: "Log in", arrow: "plain" }],
        subgraphs: [{ id: "backend", title: "Backend", members: ["app"] }],
      }),
      { previous },
    );
    expect(result.ok && result.value.graph).toEqual({
      version: 1,
      title: "OAuth login",
      nodes: [
        { id: "user", label: "Person", kind: "actor", icon: "user", category: "c1" },
        { id: "app", label: "App", kind: "service", icon: "server", zone: "backend" },
      ],
      // An edge without an id takes the id of the previous edge between the same nodes.
      edges: [{ id: "sign_in", from: "user", to: "app", label: "Log in", category: "c2" }],
      zones: [{ id: "backend", label: "Backend", category: "c3" }],
    });
  });

  it("keeps a node's kind when the diagram names it without brackets", () => {
    const result = diagramToGraph(
      diagram({
        nodes: [
          { id: "user", label: "user", shape: null },
          { id: "fresh", label: "fresh", shape: null },
        ],
      }),
      { previous },
    );
    expect(result.ok && result.value.graph.nodes.map((n) => [n.id, n.kind])).toEqual([
      ["user", "actor"],
      ["fresh", "service"],
    ]);
    expect(result.ok && result.value.notes).toEqual([]);
  });

  it("keeps the previous graph's order, with new nodes after it", () => {
    const result = diagramToGraph(
      diagram({
        nodes: [
          { id: "app", label: "App", shape: "square" },
          { id: "fresh", label: "Fresh", shape: "square" },
          { id: "user", label: "User", shape: "stadium" },
        ],
      }),
      { previous },
    );
    expect(result.ok && result.value.graph.nodes.map((n) => n.id)).toEqual([
      "user",
      "app",
      "fresh",
    ]);
  });

  it("takes the title from the diagram's front matter, else the previous graph's", () => {
    const text = "---\ntitle: Checkout flow\n---\nflowchart LR\n  a --> b";
    expect(frontMatterTitle(text)).toBe("Checkout flow");
    expect(frontMatterTitle('---\ntitle: "Quoted: yes"\n---\nflowchart LR')).toBe("Quoted: yes");
    expect(frontMatterTitle("flowchart LR\n  a --> b")).toBeUndefined();
  });

  it("names a new edge by its ends, and keeps an id written in the diagram", () => {
    const result = diagramToGraph(
      diagram({
        nodes: [
          { id: "a", label: "A", shape: "square" },
          { id: "b", label: "B", shape: "square" },
        ],
        edges: [
          { from: "a", to: "b", arrow: "plain" },
          { from: "a", to: "b", arrow: "plain" },
          { id: "back", from: "b", to: "a", arrow: "plain" },
        ],
      }),
    );
    expect(result.ok && result.value.graph.edges.map((e) => e.id)).toEqual([
      "a_to_b",
      "a_to_b_2",
      "back",
    ]);
  });

  it("keeps what fits and names the rest", () => {
    const result = diagramToGraph(
      diagram({
        nodes: [
          { id: "app", label: "App", shape: "circle" },
          { id: "new_one", label: "New", shape: "round" },
        ],
        edges: [{ from: "app", to: "new_one", arrow: "dotted" }],
        subgraphs: [
          { id: "outer", title: "Outer", members: ["inner"] },
          { id: "inner", title: "Inner", members: ["app"] },
        ],
      }),
      { previous },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.graph.nodes.map((n) => [n.id, n.kind, n.zone])).toEqual([
      ["app", "service", "inner"],
      ["new_one", "service", undefined],
    ]);
    expect(result.value.notes).toEqual([
      'node "app": a circle has no kind, so it stays a service',
      'node "new_one": a round box has no kind, so it is a service',
      "edge app --> new_one: a dotted line is drawn as a plain arrow",
      'subgraph "outer": zones cannot nest, so "inner" is a zone of its own',
    ]);
  });

  it("names the node or edge a schema error is about", () => {
    const result = diagramToGraph(
      diagram({
        nodes: [{ id: "app", label: "A label far longer than any node allows", shape: "square" }],
        edges: [{ from: "app", to: "app", label: "x".repeat(30), arrow: "plain" }],
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.path)).toEqual([
      'node "app": label',
      "edge app --> app: label",
    ]);
  });

  it("refuses a diagram that is not a flowchart, naming the line that says what it is", () => {
    expect(diagramToGraph(diagram({ type: "sequence" }), { declaredAt: 4 })).toEqual({
      ok: false,
      errors: [
        {
          path: "line 4",
          message: "a sequence diagram: only a flowchart (or graph) becomes the graph",
        },
      ],
    });
  });
});

describe("sourceLine", () => {
  it("counts back the front matter and directives Mermaid takes out before it counts lines", () => {
    const text = [
      "---",
      "title: X",
      "---",
      "%%{init: {}}%%",
      "flowchart LR",
      "  a --> b",
      "  b -->",
    ].join("\n");
    // Mermaid reads "flowchart LR" as its line 1 and "  b -->" as its line 3.
    expect(sourceLine(text, 1)).toBe(5);
    expect(sourceLine(text, 3)).toBe(7);
    expect(sourceLine("flowchart LR\n  a --> b", 2)).toBe(2);
  });

  it("finds the line that declares the diagram", () => {
    expect(
      declarationLine("---\ntitle: X\n---\n\n%% a comment\nsequenceDiagram\n  a->>b: hi"),
    ).toBe(6);
  });
});

describe("ignoredLines", () => {
  it("does not take ::: inside a quoted label for a class", () => {
    expect(ignoredLines('flowchart LR\n  a["x:::y"] --> b')).toEqual([]);
  });

  it("names the styling and links the graph does not keep, by line", () => {
    const text = [
      "flowchart LR",
      "  a --> b",
      "  style a fill:#f00",
      "  classDef hot fill:#f00",
      "  class a hot",
      "  b:::hot --> c",
      '  click a href "https://example.com"',
      "  linkStyle 0 stroke:red",
    ].join("\n");
    expect(ignoredLines(text)).toEqual([
      "line 3: style is not kept; colours come from the palette",
      "line 4: classDef is not kept; colours come from the palette",
      "line 5: class is not kept; colours come from the palette",
      "line 6: :::class is not kept; colours come from the palette",
      "line 7: click is not kept; the video has no links",
      "line 8: linkStyle is not kept; colours come from the palette",
    ]);
  });
});
