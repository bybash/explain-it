import { Worker } from "node:worker_threads";
import { z } from "zod";
import { fromMermaidDb } from "../mermaid/mermaid-db.ts";
import { diagramToGraph, frontMatterTitle, ignoredLines } from "../mermaid/parse.ts";
import { parseWith, type Validated, ValidationErrorSchema } from "../schema/errors.ts";
import type { Graph } from "../schema/graph.ts";
import { fail, ok } from "../schema/result.ts";

/** The longest a parse may take; Mermaid reads a 36-node diagram in milliseconds. */
const PARSE_TIMEOUT_MS = 15_000;

/** What the worker sends back: Mermaid's database, or the error that names its line. */
const ReplySchema = z.union([
  z.object({
    id: z.number(),
    ok: z.literal(true),
    value: z.object({
      type: z.string(),
      title: z.string().optional(),
      vertices: z.array(z.object({ id: z.string(), text: z.string(), type: z.string() })),
      edges: z.array(
        z.object({
          id: z.string(),
          start: z.string(),
          end: z.string(),
          text: z.string(),
          type: z.string(),
          stroke: z.string(),
          isUserDefinedId: z.boolean(),
        }),
      ),
      subgraphs: z.array(
        z.object({ id: z.string(), title: z.string(), nodes: z.array(z.string()) }),
      ),
    }),
  }),
  z.object({ id: z.number(), ok: z.literal(false), errors: z.array(ValidationErrorSchema) }),
]);
type Reply = z.output<typeof ReplySchema>;

let worker: { readonly thread: Worker; readonly ready: Promise<void> } | undefined;
let nextId = 0;
const waiting = new Map<number, (reply: Reply) => void>();

/** The worker that runs Mermaid, started on first use and kept; it never holds the process open. */
const mermaidWorker = () => {
  if (worker) return worker;
  const thread = new Worker(new URL("./mermaid-worker.ts", import.meta.url));
  thread.unref();
  const ready = new Promise<void>((resolve, reject) => {
    thread.once("error", reject);
    thread.on("message", (message: unknown) => {
      if ((message as { ready?: boolean }).ready) return resolve();
      const reply = parseWith(ReplySchema, message);
      if (!reply.ok) return;
      waiting.get(reply.value.id)?.(reply.value);
      waiting.delete(reply.value.id);
    });
  });
  // A worker that dies is started again on the next parse.
  thread.once("exit", () => {
    worker = undefined;
  });
  worker = { thread, ready };
  return worker;
};

const readDiagram = async (text: string): Promise<Reply> => {
  const { thread, ready } = mermaidWorker();
  await ready;
  const id = nextId++;
  return new Promise<Reply>((resolve) => {
    const timer = setTimeout(() => {
      waiting.delete(id);
      resolve({
        id,
        ok: false,
        errors: [{ path: "(diagram)", message: "Mermaid took too long to read it" }],
      });
    }, PARSE_TIMEOUT_MS);
    timer.unref();
    waiting.set(id, (reply) => {
      clearTimeout(timer);
      resolve(reply);
    });
    thread.postMessage({ id, text });
  });
};

/**
 * Mermaid text as the graph (SPEC, Mermaid): parsed by the pinned `mermaid`
 * package, then each node's kind read from its shape and what Mermaid cannot
 * say kept from `previous` by id. `notes` names what the graph leaves out
 * (styles, links, line kinds); errors name the Mermaid line or the node.
 */
export const mermaidToGraph = async (
  text: string,
  previous?: Graph,
): Promise<Validated<{ readonly graph: Graph; readonly notes: readonly string[] }>> => {
  const reply = await readDiagram(text);
  if (!reply.ok) return fail(reply.errors);
  const diagram = fromMermaidDb(reply.value);
  const title = diagram.title ?? frontMatterTitle(text);
  const read = diagramToGraph(
    title ? { ...diagram, title } : diagram,
    previous ? { previous } : {},
  );
  if (!read.ok) return read;
  return ok({ graph: read.value.graph, notes: [...ignoredLines(text), ...read.value.notes] });
};
