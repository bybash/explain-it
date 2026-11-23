import type { Graph, GraphNode, NodeKind } from "../schema/graph.ts";

/**
 * Each kind's Mermaid shape, so the diagram reads like the video: the
 * brackets the generator writes, and the name Mermaid's parser gives that
 * shape, which `parse.ts` reads the kind back from. Mermaid has no field for
 * the kind itself: it, the icon and the category are kept in graph.json and
 * matched back by id (SPEC, Graph).
 */
export const KIND_SHAPES: Readonly<
  Record<NodeKind, { readonly open: string; readonly close: string; readonly mermaid: string }>
> = {
  actor: { open: "([", close: "])", mermaid: "stadium" },
  service: { open: "[", close: "]", mermaid: "square" },
  database: { open: "[(", close: ")]", mermaid: "cylinder" },
  queue: { open: "[[", close: "]]", mermaid: "subroutine" },
  document: { open: ">", close: "]", mermaid: "odd" },
  decision: { open: "{", close: "}", mermaid: "diamond" },
  external: { open: "{{", close: "}}", mermaid: "hexagon" },
};

/** Mermaid entity codes for characters it would otherwise read as syntax. */
const ENTITIES: Readonly<Record<string, string>> = {
  "#": "#35;",
  '"': "#quot;",
  "|": "#124;",
  "<": "#lt;",
  ">": "#gt;",
  "`": "#96;",
};

/** A label as a quoted Mermaid string. */
const text = (label: string): string =>
  `"${label.replace(/[#"|<>`]/g, (c) => ENTITIES[c] ?? c).replace(/\r?\n/g, "<br>")}"`;

const nodeLine = (node: GraphNode, indent: string): string => {
  const { open, close } = KIND_SHAPES[node.kind];
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
