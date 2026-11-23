// Mermaid's parser in a worker thread of its own. Mermaid needs a browser's
// window and document, which jsdom gives it here; set in the server's own
// thread, they would make other libraries (transformers.js, for the voice)
// think they run in a browser.
import { parentPort } from "node:worker_threads";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
Object.assign(globalThis, { window: dom.window, document: dom.window.document });
const { default: mermaid } = await import("mermaid");
mermaid.initialize({ startOnLoad: false });

/** Mermaid's flowchart database, as far as this reads it; the main thread checks what comes of it. */
type FlowDb = {
  getDiagramTitle?: () => unknown;
  getVertices: () => Map<string, { id: unknown; text: unknown; type?: unknown }>;
  getEdges: () => Record<string, unknown>[];
  getSubGraphs: () => { id: unknown; title: unknown; nodes: unknown }[];
};

/** A parse error's place: Mermaid's lexer counts lines from 1. */
type ParseError = Error & { hash?: { text?: string; loc?: { first_line?: number } } };

/** Mermaid's database for the text, passed on as Mermaid gives it: no defaults hide a change. */
const read = async (text: string): Promise<unknown> => {
  const diagram = await mermaid.mermaidAPI.getDiagramFromText(text);
  if (!diagram.type.startsWith("flowchart"))
    return { type: diagram.type, vertices: [], edges: [], subgraphs: [] };
  const db = diagram.db as unknown as FlowDb;
  const title = db.getDiagramTitle?.();
  return {
    type: diagram.type,
    ...(title ? { title } : {}),
    vertices: [...db.getVertices().values()].map((v) => ({
      id: v.id,
      text: v.text,
      type: v.type ?? null,
    })),
    edges: db.getEdges().map((e) => ({
      id: e.id,
      start: e.start,
      end: e.end,
      text: e.text,
      type: e.type,
      stroke: e.stroke,
      isUserDefinedId: e.isUserDefinedId === true,
    })),
    subgraphs: db.getSubGraphs().map((s) => ({ id: s.id, title: s.title, nodes: s.nodes })),
  };
};

/** Where Mermaid stopped: its own line count, which the main thread maps back to the source. */
const describeError = (error: unknown) => {
  const e = error as ParseError;
  const found = e.hash?.text;
  return {
    ...(e.hash?.loc?.first_line !== undefined ? { line: e.hash.loc.first_line } : {}),
    message:
      e.hash?.loc?.first_line === undefined
        ? (String(e.message ?? error).split("\n")[0] ?? "unreadable")
        : found
          ? `Mermaid cannot read "${found}" here`
          : "Mermaid cannot read this line",
  };
};

// One diagram at a time: Mermaid keeps the diagram being parsed in module state.
let queue: Promise<unknown> = Promise.resolve();
parentPort?.on("message", ({ id, text }: { id: number; text: string }) => {
  queue = queue.then(async () => {
    try {
      parentPort?.postMessage({ id, ok: true, value: await read(text) });
    } catch (error) {
      parentPort?.postMessage({ id, ok: false, error: describeError(error) });
    }
  });
});
parentPort?.postMessage({ ready: true });
