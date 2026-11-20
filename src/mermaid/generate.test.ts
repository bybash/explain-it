import { describe, expect, it } from "vitest";
import graphJson from "../../examples/oauth-login/graph.json" with { type: "json" };
import { orThrow } from "../schema/errors.ts";
import { type Graph, parseGraph } from "../schema/graph.ts";
import { graphToMermaid } from "./generate.ts";

const graph = (data: Omit<Graph, "version" | "zones"> & { zones?: Graph["zones"] }): Graph =>
  orThrow(parseGraph({ version: 1, zones: [], ...data }), "graph");

describe("graphToMermaid", () => {
  it("writes a left-to-right flowchart with each node shaped by its kind", () => {
    const mermaid = graphToMermaid(
      graph({
        title: "Kinds",
        nodes: [
          { id: "user", label: "User", kind: "actor" },
          { id: "api", label: "API", kind: "service" },
          { id: "db", label: "Users", kind: "database" },
          { id: "jobs", label: "Jobs", kind: "queue" },
          { id: "doc", label: "Spec", kind: "document" },
          { id: "ok", label: "Valid?", kind: "decision" },
          { id: "idp", label: "Google", kind: "external" },
        ],
        edges: [],
      }),
    );
    expect(mermaid.split("\n")).toEqual([
      "flowchart LR",
      '  user(["User"])',
      '  api["API"]',
      '  db[("Users")]',
      '  jobs[["Jobs"]]',
      '  doc>"Spec"]',
      '  ok{"Valid?"}',
      '  idp{{"Google"}}',
    ]);
  });

  it("puts zoned nodes in subgraphs and names every edge by its id", () => {
    const mermaid = graphToMermaid(
      graph({
        title: "Zones",
        nodes: [
          { id: "user", label: "User", kind: "actor" },
          { id: "app", label: "Web app", kind: "service", zone: "backend" },
        ],
        edges: [
          { id: "open", from: "user", to: "app", label: "Opens" },
          { id: "back", from: "app", to: "user" },
        ],
        zones: [{ id: "backend", label: "Your app" }],
      }),
    );
    expect(mermaid.split("\n")).toEqual([
      "flowchart LR",
      '  subgraph backend["Your app"]',
      '    app["Web app"]',
      "  end",
      '  user(["User"])',
      '  user open@-->|"Opens"| app',
      "  app back@--> user",
    ]);
  });

  it("escapes quotes and other characters Mermaid would read as syntax", () => {
    const mermaid = graphToMermaid(
      graph({
        title: "Escapes",
        nodes: [
          { id: "a", label: 'Say "hi" #1', kind: "service" },
          { id: "b", label: "B", kind: "service" },
        ],
        edges: [{ id: "e", from: "a", to: "b", label: "a|b" }],
      }),
    );
    expect(mermaid).toContain('a["Say #quot;hi#quot; #35;1"]');
    expect(mermaid).toContain('a e@-->|"a#124;b"| b');
  });

  it("names every node and edge of the example once", () => {
    const example = orThrow(parseGraph(graphJson), "graph.json");
    const mermaid = graphToMermaid(example);
    for (const node of example.nodes)
      expect(mermaid.match(new RegExp(`^\\s+${node.id}[\\[({>]`, "gm")), node.id).toHaveLength(1);
    for (const edge of example.edges)
      expect(mermaid.match(new RegExp(` ${edge.id}@-->`, "g")), edge.id).toHaveLength(1);
  });
});
