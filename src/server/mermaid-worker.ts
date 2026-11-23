// Mermaid's parser in a worker thread of its own. Mermaid needs a browser's
// window and document, which jsdom gives it here; set in the server's own
// thread, they would make other libraries (transformers.js, for the voice)
// think they run in a browser.
import { parentPort } from "node:worker_threads";
import { JSDOM } from "jsdom";
import type { MermaidDb } from "../mermaid/mermaid-db.ts";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
Object.assign(globalThis, { window: dom.window, document: dom.window.document });
const { default: mermaid } = await import("mermaid");
mermaid.initialize({ startOnLoad: false });

/** What Mermaid's flowchart database is, as far as this reads it. */
type FlowDb = {
  getDiagramTitle?: () => string;
  getVertices: () => Map<string, { id: string; text: string; type?: string }>;
  getEdges: () => {
    id?: string;
    start: string;
    end: string;
    text?: string;
    type?: string;
    stroke?: string;
    isUserDefinedId?: boolean;
  }[];
  getSubGraphs: () => { id: string; title: string; nodes: string[] }[];
};

/** A parse error's place: Mermaid's lexer counts lines from 1. */
type ParseError = Error & { hash?: { text?: string; loc?: { first_line?: number } } };

const read = async (text: string): Promise<MermaidDb> => {
  const diagram = await mermaid.mermaidAPI.getDiagramFromText(text);
  if (!diagram.type.startsWith("flowchart"))
    return { type: diagram.type, vertices: [], edges: [], subgraphs: [] };
  const db = diagram.db as unknown as FlowDb;
  return {
    type: diagram.type,
    title: db.getDiagramTitle?.() ?? "",
    vertices: [...db.getVertices().values()].map((v) => ({
      id: v.id,
      text: v.text,
      type: v.type ?? "square",
    })),
    edges: db.getEdges().map((e) => ({
      id: e.id ?? "",
      start: e.start,
      end: e.end,
      text: e.text ?? "",
      type: e.type ?? "arrow_point",
      stroke: e.stroke ?? "normal",
      isUserDefinedId: e.isUserDefinedId === true,
    })),
    subgraphs: db.getSubGraphs().map((s) => ({ id: s.id, title: s.title, nodes: s.nodes })),
  };
};

const describeError = (error: unknown) => {
  const e = error as ParseError;
  const line = e.hash?.loc?.first_line;
  const found = e.hash?.text;
  if (line !== undefined)
    return {
      path: `line ${line}`,
      message: found ? `Mermaid cannot read "${found}" here` : "Mermaid cannot read this line",
    };
  return { path: "(diagram)", message: String(e.message ?? error).split("\n")[0] ?? "unreadable" };
};

// One diagram at a time: Mermaid keeps the diagram being parsed in module state.
let queue: Promise<unknown> = Promise.resolve();
parentPort?.on("message", ({ id, text }: { id: number; text: string }) => {
  queue = queue.then(async () => {
    try {
      parentPort?.postMessage({ id, ok: true, value: await read(text) });
    } catch (error) {
      parentPort?.postMessage({ id, ok: false, errors: [describeError(error)] });
    }
  });
});
parentPort?.postMessage({ ready: true });
