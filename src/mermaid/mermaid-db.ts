import type { Arrow, Diagram } from "./parse.ts";

/**
 * What Mermaid's flowchart database holds, as `src/server/mermaid-worker.ts`
 * reads it. This is Mermaid's internal API, not a public one (SPEC, Mermaid),
 * so it is read in this one place and checked by the round-trip tests.
 */
export type MermaidDb = {
  readonly type: string;
  readonly title?: string | undefined;
  readonly vertices: readonly {
    readonly id: string;
    readonly text: string;
    readonly type: string;
  }[];
  readonly edges: readonly {
    readonly id: string;
    readonly start: string;
    readonly end: string;
    readonly text: string;
    readonly type: string;
    readonly stroke: string;
    readonly isUserDefinedId: boolean;
  }[];
  readonly subgraphs: readonly {
    readonly id: string;
    readonly title: string;
    readonly nodes: readonly string[];
  }[];
};

/** Mermaid keeps entity codes as placeholders while it parses: ﬂ°°35¶ß for #35; and ﬂ°quot¶ß for #quot;. */
const NAMED: Readonly<Record<string, string>> = {
  quot: '"',
  lt: "<",
  gt: ">",
  amp: "&",
  apos: "'",
  nbsp: " ",
};

/** A label as written: entity codes back to their characters, `<br>` back to a line break. */
const decoded = (text: string): string =>
  text
    .replace(/ﬂ°°(\d+)¶ß/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/ﬂ°(\w+)¶ß/g, (whole, name: string) => NAMED[name] ?? whole)
    .replace(/<br\s*\/?>/gi, "\n");

/** How a Mermaid link is drawn, from its type and stroke. */
const arrowOf = (type: string, stroke: string): Arrow => {
  if (stroke === "dotted" || stroke === "thick" || stroke === "invisible") return stroke;
  if (type.startsWith("double_")) return "both";
  if (type === "arrow_open") return "open";
  if (type === "arrow_cross") return "cross";
  if (type === "arrow_circle") return "circle";
  return "plain";
};

/** Mermaid's flowchart database as a plain diagram (see `parse.ts`). */
export const fromMermaidDb = (db: MermaidDb): Diagram => ({
  type: db.type === "flowchart-v2" || db.type === "flowchart" ? "flowchart" : db.type,
  ...(db.title ? { title: decoded(db.title) } : {}),
  nodes: db.vertices.map((v) => ({ id: v.id, label: decoded(v.text), shape: v.type })),
  edges: db.edges.map((e) => ({
    ...(e.isUserDefinedId ? { id: e.id } : {}),
    from: e.start,
    to: e.end,
    ...(e.text ? { label: decoded(e.text) } : {}),
    arrow: arrowOf(e.type, e.stroke),
  })),
  subgraphs: db.subgraphs.map((s) => ({
    id: s.id,
    title: decoded(s.title),
    members: [...s.nodes],
  })),
});
