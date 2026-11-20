import type { Graph, GraphNode } from "../schema/graph.ts";

/**
 * Each kind's Mermaid shape, so the diagram reads like the video. Mermaid
 * has no field for the kind itself: it, the icon and the category are kept
 * in graph.json and matched back by id (SPEC, Graph).
 */
const SHAPES: Readonly<Record<GraphNode["kind"], readonly [string, string]>> = {
  actor: ["([", "])"],
  service: ["[", "]"],
  database: ["[(", ")]"],
  queue: ["[[", "]]"],
  document: [">", "]"],
  decision: ["{", "}"],
  external: ["{{", "}}"],
};

/** Mermaid entity codes for characters it would otherwise read as syntax. */
const ENTITIES: Readonly<Record<string, string>> = {
  "#": "#35;",
  '"': "#quot;",
  "|": "#124;",
  "<": "#lt;",
  ">": "#gt;",
};

/** A label as a quoted Mermaid string. */
const text = (label: string): string => `"${label.replace(/[#"|<>]/g, (c) => ENTITIES[c] ?? c)}"`;

const nodeLine = (node: GraphNode, indent: string): string => {
  const [open, close] = SHAPES[node.kind];
  return `${indent}${node.id}${open}${text(node.label)}${close}`;
};

/**
 * The graph as a Mermaid flowchart, for showing and approving: zones as
 * subgraphs with their nodes, then the other nodes, then the edges, each
 * edge named by its id (`from id@--> to`) so edits can be matched back.
 */
export const graphToMermaid = (graph: Graph): string => {
  const lines = ["flowchart LR"];
  for (const zone of graph.zones) {
    lines.push(`  subgraph ${zone.id}[${text(zone.label)}]`);
    for (const node of graph.nodes.filter((n) => n.zone === zone.id))
      lines.push(nodeLine(node, "    "));
    lines.push("  end");
  }
  for (const node of graph.nodes.filter((n) => n.zone === undefined))
    lines.push(nodeLine(node, "  "));
  for (const edge of graph.edges) {
    const label = edge.label === undefined ? "" : `|${text(edge.label)}|`;
    lines.push(`  ${edge.from} ${edge.id}@-->${label} ${edge.to}`);
  }
  return lines.join("\n");
};
