import { describe, expect, it } from "vitest";
import { formatErrors } from "./errors.ts";
import { MAX_GRAPH_NODES, parseGraph } from "./graph.ts";

const validGraph = () => ({
  version: 1,
  title: "Login",
  nodes: [
    { id: "browser", label: "Browser", kind: "actor" },
    { id: "app", label: "App", kind: "service", zone: "backend", icon: "server" },
    { id: "db", label: "Users", kind: "database", zone: "backend" },
  ],
  edges: [
    { id: "e1", from: "browser", to: "app", label: "POST /login" },
    { id: "e2", from: "app", to: "db" },
  ],
  zones: [{ id: "backend", label: "Backend" }],
});

const errorsFor = (data: unknown) => {
  const result = parseGraph(data);
  if (result.ok) throw new Error("expected errors");
  return formatErrors(result.errors);
};

describe("parseGraph", () => {
  it("accepts a valid graph", () => {
    const result = parseGraph(validGraph());
    expect(result.ok).toBe(true);
  });

  it("limits label length", () => {
    const graph = validGraph();
    graph.nodes[0] = { id: "browser", label: "A".repeat(25), kind: "actor" };
    expect(errorsFor(graph)).toEqual(["nodes[0].label: 25 characters, max 24"]);
  });

  it("keeps node and zone ids clear of Mermaid's keywords, which would break the diagram", () => {
    const graph = validGraph();
    graph.nodes[0] = { id: "end", label: "End", kind: "actor" };
    graph.zones[0] = { id: "subgraph", label: "Backend" };
    graph.nodes[1] = {
      ...graph.nodes[1],
      id: "app",
      label: "App",
      kind: "service",
      zone: "subgraph",
    };
    graph.nodes[2] = {
      ...graph.nodes[2],
      id: "db",
      label: "Users",
      kind: "database",
      zone: "subgraph",
    };
    graph.edges[0] = { id: "e1", from: "end", to: "app", label: "POST /login" };
    expect(errorsFor(graph)).toEqual(
      expect.arrayContaining([
        'nodes[0].id: "end" is a Mermaid keyword; use another id',
        'zones[0].id: "subgraph" is a Mermaid keyword; use another id',
      ]),
    );
  });

  it("requires ids a slug can use", () => {
    const graph = validGraph();
    graph.nodes[0] = { id: "Browser", label: "Browser", kind: "actor" };
    expect(errorsFor(graph)[0]).toMatch(/^nodes\[0\]\.id: must start with a lowercase letter/);
  });

  it("lists the node kinds", () => {
    const graph = validGraph();
    graph.nodes[0] = { id: "browser", label: "Browser", kind: "robot" };
    expect(errorsFor(graph)).toEqual([
      'nodes[0].kind: must be one of "actor", "service", "database", "queue", "document", "decision", "external"',
    ]);
  });

  it(`allows at most ${MAX_GRAPH_NODES} nodes`, () => {
    const graph = validGraph();
    graph.nodes = Array.from({ length: MAX_GRAPH_NODES + 1 }, (_, i) => ({
      id: `n${i}`,
      label: `Node ${i}`,
      kind: "service",
    }));
    graph.edges = [];
    expect(errorsFor(graph)).toEqual([
      `nodes: ${MAX_GRAPH_NODES + 1} items, max ${MAX_GRAPH_NODES}`,
    ]);
  });

  it("rejects duplicate ids across nodes, edges and zones", () => {
    const graph = validGraph();
    graph.edges[1] = { id: "app", from: "app", to: "db" };
    expect(errorsFor(graph)).toEqual(['edges[1].id: duplicate id "app"']);
  });

  it("rejects edges to unknown nodes", () => {
    const graph = validGraph();
    graph.edges[1] = { id: "e2", from: "app", to: "cache" };
    expect(errorsFor(graph)).toEqual(['edges[1].to: unknown node "cache"']);
  });

  it("rejects unknown zones", () => {
    const graph = validGraph();
    graph.nodes[2] = { id: "db", label: "Users", kind: "database", zone: "storage" };
    expect(errorsFor(graph)).toEqual(['nodes[2].zone: unknown zone "storage"']);
  });

  it("rejects icons Lucide does not have", () => {
    const graph = validGraph();
    graph.nodes[1] = { id: "app", label: "App", kind: "service", zone: "backend", icon: "sever" };
    expect(errorsFor(graph)).toEqual(['nodes[1].icon: unknown Lucide icon "sever"']);
  });

  it("accepts Lucide names with digits", () => {
    const graph = validGraph();
    graph.nodes[1] = {
      id: "app",
      label: "App",
      kind: "service",
      zone: "backend",
      icon: "clock-10",
    };
    expect(parseGraph(graph).ok).toBe(true);
  });

  it("rejects unknown keys, to catch typos", () => {
    const graph = { ...validGraph(), colour: "red" };
    expect(errorsFor(graph)).toEqual(["colour: unknown key"]);
  });

  it("reports shape errors before reference errors", () => {
    const graph = validGraph();
    graph.edges[1] = { id: "e2", from: "app", to: "cache" };
    graph.title = "";
    expect(errorsFor(graph)).toEqual(["title: must not be empty"]);
  });
});
