import type { ValidationError } from "../schema/errors.ts";
import { type Graph, type GraphEdge, type NodeKind, parseGraph } from "../schema/graph.ts";
import { fail, ok, type Result } from "../schema/result.ts";

/**
 * A Mermaid diagram as plain data: what `src/server/mermaid.ts` reads from
 * Mermaid's own parser, with entity codes already decoded.
 */
export type Diagram = {
  /** Mermaid's diagram type: "flowchart" for flowchart and graph. */
  readonly type: string;
  readonly title?: string;
  readonly nodes: readonly {
    readonly id: string;
    readonly label: string;
    readonly shape: string;
  }[];
  readonly edges: readonly DiagramEdge[];
  readonly subgraphs: readonly {
    readonly id: string;
    readonly title: string;
    /** Node ids, and the ids of subgraphs inside it. */
    readonly members: readonly string[];
  }[];
};

/** How an edge is drawn; the graph has one kind of edge, a plain arrow. */
export const ARROWS = [
  "plain",
  "dotted",
  "thick",
  "open",
  "cross",
  "circle",
  "both",
  "invisible",
] as const;
export type Arrow = (typeof ARROWS)[number];

export type DiagramEdge = {
  /** Set when the diagram names the edge (`from id@--> to`). */
  readonly id?: string;
  readonly from: string;
  readonly to: string;
  readonly label?: string;
  readonly arrow: Arrow;
};

/** What a drawn edge loses as a plain arrow. */
const ARROW_NOTES: Readonly<Record<Exclude<Arrow, "plain">, string>> = {
  dotted: "a dotted line is drawn as a plain arrow",
  thick: "a thick line is drawn as a plain arrow",
  open: "a line without an arrowhead is drawn as an arrow",
  cross: "a cross end is drawn as an arrowhead",
  circle: "a circle end is drawn as an arrowhead",
  both: "an arrow both ways is drawn one way",
  invisible: "an invisible link is drawn as an arrow",
};

/** Each kind's shape, as Mermaid names it: the generator's brackets, read back. */
const KIND_OF_SHAPE: Readonly<Record<string, NodeKind>> = {
  stadium: "actor",
  square: "service",
  cylinder: "database",
  subroutine: "queue",
  odd: "document",
  diamond: "decision",
  hexagon: "external",
};

const SHAPE_NAMES: Readonly<Record<string, string>> = {
  round: "a round box",
  circle: "a circle",
  doublecircle: "a double circle",
  ellipse: "an ellipse",
  lean_right: "a parallelogram",
  lean_left: "a parallelogram",
  trapezoid: "a trapezoid",
  inv_trapezoid: "a trapezoid",
};

/** The kind a node takes when its shape has none and it is new. */
const DEFAULT_KIND: NodeKind = "service";

/** `a_to_b`, then `a_to_b_2` and on for more edges between the same nodes. */
const numbered = (base: string, n: number) => (n === 1 ? base : `${base}_${n}`);

/**
 * A Mermaid flowchart as the graph (SPEC, Mermaid): each node's kind from
 * its shape, zones from subgraphs, and what Mermaid cannot say (icons,
 * categories, an edge's id) kept from `previous`, matched by id. What does
 * not fit is kept as near as it can be and named in `notes`; a diagram that
 * is not a flowchart, or a graph the schema refuses, is an error that names
 * the node, edge or subgraph.
 */
export const diagramToGraph = (
  diagram: Diagram,
  { previous }: { readonly previous?: Graph } = {},
): Result<{ readonly graph: Graph; readonly notes: readonly string[] }, ValidationError> => {
  if (diagram.type !== "flowchart")
    return fail([
      {
        path: "(diagram)",
        message: `a ${diagram.type} diagram: only a flowchart (or graph) becomes the graph`,
      },
    ]);
  const notes: string[] = [];
  const before = new Map(previous?.nodes.map((n) => [n.id, n]));
  const subgraphIds = new Set(diagram.subgraphs.map((s) => s.id));
  const zoneOf = new Map<string, string>();
  for (const subgraph of diagram.subgraphs)
    for (const member of subgraph.members)
      if (!subgraphIds.has(member) && !zoneOf.has(member)) zoneOf.set(member, subgraph.id);

  const nodes = diagram.nodes.map((node) => {
    const old = before.get(node.id);
    let kind = KIND_OF_SHAPE[node.shape];
    if (kind === undefined) {
      kind = old?.kind ?? DEFAULT_KIND;
      const shape = SHAPE_NAMES[node.shape] ?? `a ${node.shape} shape`;
      notes.push(
        `node "${node.id}": ${shape} has no kind, so it ${old ? "stays" : "is"} a ${kind}`,
      );
    }
    const zone = zoneOf.get(node.id);
    return {
      id: node.id,
      label: node.label,
      kind,
      ...(old?.icon !== undefined ? { icon: old.icon } : {}),
      ...(zone !== undefined ? { zone } : {}),
      ...(old?.category !== undefined ? { category: old.category } : {}),
    };
  });

  // An edge without an id takes one from the previous graph between the same nodes, so its
  // category and the storyboard's references to it survive; otherwise it is named by its ends.
  const unclaimed = [...(previous?.edges ?? [])];
  const taken = new Set(diagram.edges.flatMap((e) => (e.id ? [e.id] : [])));
  const oldEdges = new Map(previous?.edges.map((e) => [e.id, e]));
  const edges = diagram.edges.map((edge): GraphEdge => {
    if (edge.arrow !== "plain")
      notes.push(`edge ${edge.from} --> ${edge.to}: ${ARROW_NOTES[edge.arrow]}`);
    let id = edge.id;
    if (id === undefined) {
      const match = unclaimed.find(
        (e) => e.from === edge.from && e.to === edge.to && !taken.has(e.id),
      );
      id = match?.id;
      if (id === undefined) {
        const base = `${edge.from}_to_${edge.to}`;
        let n = 1;
        while (taken.has(numbered(base, n))) n++;
        id = numbered(base, n);
      }
    }
    taken.add(id);
    const category = oldEdges.get(id)?.category;
    return {
      id,
      from: edge.from,
      to: edge.to,
      ...(edge.label ? { label: edge.label } : {}),
      ...(category !== undefined ? { category } : {}),
    };
  });

  const oldZones = new Map(previous?.zones.map((z) => [z.id, z]));
  for (const subgraph of diagram.subgraphs)
    for (const member of subgraph.members)
      if (subgraphIds.has(member))
        notes.push(
          `subgraph "${subgraph.id}": zones cannot nest, so "${member}" is a zone of its own`,
        );
  const zones = diagram.subgraphs.map((subgraph) => {
    const category = oldZones.get(subgraph.id)?.category;
    return {
      id: subgraph.id,
      label: subgraph.title,
      ...(category !== undefined ? { category } : {}),
    };
  });

  // The previous graph's order, which the generator does not keep (it writes zones first); new nodes after.
  const order = new Map(previous?.nodes.map((n, i) => [n.id, i]));
  const rank = (id: string) => order.get(id) ?? Number.MAX_SAFE_INTEGER;
  nodes.sort((a, b) => rank(a.id) - rank(b.id));

  const graph = {
    version: 1 as const,
    title: diagram.title || previous?.title || "Untitled",
    nodes,
    edges,
    zones,
  };
  const parsed = parseGraph(graph);
  if (!parsed.ok) return fail(parsed.errors.map((e) => ({ ...e, path: inDiagram(graph, e.path) })));
  return ok({ graph: parsed.value, notes });
};

/** A schema error's place, said the way the Mermaid names it: `node "app": label`. */
const inDiagram = (graph: Pick<Graph, "nodes" | "edges" | "zones">, path: string): string => {
  const match = /^(nodes|edges|zones)\[(\d+)\]\.?(.*)$/.exec(path);
  if (!match) return path;
  const [, list, index, rest] = match;
  const i = Number(index);
  const where =
    list === "nodes"
      ? `node "${graph.nodes[i]?.id}"`
      : list === "edges"
        ? `edge ${graph.edges[i]?.from} --> ${graph.edges[i]?.to}`
        : `subgraph "${graph.zones[i]?.id}"`;
  return rest ? `${where}: ${rest}` : where;
};

/** The `title:` in a diagram's front matter (`---` lines before it), which names the graph. */
export const frontMatterTitle = (text: string): string | undefined => {
  const front = /^\s*---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1];
  const title = front && /^title:\s*(.+?)\s*$/m.exec(front)?.[1];
  if (!title) return undefined;
  const quoted = /^(["'])(.*)\1$/.exec(title);
  return quoted ? quoted[2] : title;
};

/** Statements the graph does not keep, matched at the start of a line. */
const IGNORED: readonly {
  readonly pattern: RegExp;
  readonly name: string;
  readonly why: string;
}[] = [
  { pattern: /^\s*style\s/, name: "style", why: "colours come from the palette" },
  { pattern: /^\s*classDef\s/, name: "classDef", why: "colours come from the palette" },
  { pattern: /^\s*class\s/, name: "class", why: "colours come from the palette" },
  { pattern: /^\s*click\s/, name: "click", why: "the video has no links" },
  { pattern: /^\s*linkStyle\s/, name: "linkStyle", why: "colours come from the palette" },
  { pattern: /:::[A-Za-z_]/, name: ":::class", why: "colours come from the palette" },
];

/** The lines of Mermaid text whose styling or links the graph leaves out, each named. */
export const ignoredLines = (text: string): string[] =>
  text.split(/\r?\n/).flatMap((line, i) => {
    const ignored = IGNORED.find((rule) => rule.pattern.test(line));
    return ignored ? [`line ${i + 1}: ${ignored.name} is not kept; ${ignored.why}`] : [];
  });
