import { Worker } from "node:worker_threads";
import { z } from "zod";
import { fromMermaidDb, MermaidDbSchema } from "../mermaid/mermaid-db.ts";
import {
  declarationLine,
  diagramToGraph,
  frontMatterTitle,
  ignoredLines,
  sourceLine,
} from "../mermaid/parse.ts";
import { formatErrors, parseWith, type Validated, type ValidationError } from "../schema/errors.ts";
import type { Graph } from "../schema/graph.ts";
import { fail, ok } from "../schema/result.ts";

/** The longest a parse may take; Mermaid reads a 36-node diagram in milliseconds. */
const PARSE_TIMEOUT_MS = 15_000;

/** What the worker sends: that it is ready, then for each parse Mermaid's database or where it stopped. */
const ReadySchema = z.object({ ready: z.literal(true) });
const ReplySchema = z.discriminatedUnion("ok", [
  z.object({ id: z.number(), ok: z.literal(true), value: MermaidDbSchema }),
  z.object({
    id: z.number(),
    ok: z.literal(false),
    error: z.object({ line: z.number().optional(), message: z.string() }),
  }),
]);

type Read =
  | { readonly ok: true; readonly value: z.output<typeof MermaidDbSchema> }
  | {
      readonly ok: false;
      readonly error: { readonly line?: number | undefined; readonly message: string };
    };

/** The parses waiting for the worker, by request id. */
const waiting = new Map<number, (read: Read) => void>();
let nextId = 0;
let worker: { readonly thread: Worker; readonly ready: Promise<void> } | undefined;

/** Ends every waiting parse with `message`: the worker stopped, or sent what it should not. */
const failWaiting = (message: string) => {
  for (const settle of waiting.values()) settle({ ok: false, error: { message } });
  waiting.clear();
};

/** The worker that runs Mermaid, started on first use and kept; it never holds the process open. */
const mermaidWorker = () => {
  if (worker) return worker;
  const thread = new Worker(new URL("./mermaid-worker.ts", import.meta.url));
  thread.unref();
  const ready = new Promise<void>((resolve, reject) => {
    thread.on("message", (data: unknown) => {
      if (ReadySchema.safeParse(data).success) return resolve();
      // Only a parse's reply carries its id. Node posts messages of its own too: under
      // --watch (npm run dev), each worker reports the files it imports ("watch:import").
      if (typeof data !== "object" || data === null || !("id" in data)) return;
      const message = parseWith(ReplySchema, data);
      // The worker is ours, so a message it should not send is a bug: every waiting parse hears of it.
      if (!message.ok)
        return failWaiting(
          `the Mermaid worker sent what it should not:\n${formatErrors(message.errors).join("\n")}`,
        );
      const { id, ...read } = message.value;
      waiting.get(id)?.(read);
      waiting.delete(id);
    });
    thread.once("error", (error) => {
      reject(error);
      failWaiting(`the Mermaid worker stopped: ${error.message}`);
    });
  });
  // The next parse starts a new worker.
  thread.once("exit", () => {
    worker = undefined;
    failWaiting("the Mermaid worker stopped");
  });
  worker = { thread, ready };
  return worker;
};

const readDiagram = async (text: string): Promise<Read> => {
  const { thread, ready } = mermaidWorker();
  try {
    await ready;
  } catch (error) {
    return {
      ok: false,
      error: { message: `Mermaid could not start: ${(error as Error).message}` },
    };
  }
  const id = nextId++;
  return new Promise<Read>((resolve) => {
    const timer = setTimeout(() => {
      waiting.delete(id);
      resolve({ ok: false, error: { message: "Mermaid took too long to read it" } });
    }, PARSE_TIMEOUT_MS);
    timer.unref();
    waiting.set(id, (read) => {
      clearTimeout(timer);
      resolve(read);
    });
    thread.postMessage({ id, text });
  });
};

/**
 * Mermaid text as the graph (SPEC, Mermaid): parsed by the pinned `mermaid`
 * package in a worker, then each node's kind read from its shape and what
 * Mermaid cannot say kept from `previous` by id. `notes` names what the graph
 * leaves out (styles, links, line kinds); errors name the source line, or
 * the node or edge.
 */
export const mermaidToGraph = async (
  text: string,
  previous?: Graph,
  /** The title when neither the diagram nor `previous` has one, such as the project's name. */
  title?: string,
): Promise<Validated<{ readonly graph: Graph; readonly notes: readonly string[] }>> => {
  const read = await readDiagram(text);
  if (!read.ok) {
    const { line, message } = read.error;
    const error: ValidationError = {
      path: line === undefined ? "(diagram)" : `line ${sourceLine(text, line)}`,
      message,
    };
    return fail([error]);
  }
  const diagram = fromMermaidDb(read.value);
  const named = diagram.title ?? frontMatterTitle(text) ?? (previous ? undefined : title);
  const graph = diagramToGraph(named ? { ...diagram, title: named } : diagram, {
    previous,
    declaredAt: declarationLine(text),
  });
  if (!graph.ok) return graph;
  return ok({ graph: graph.value.graph, notes: [...ignoredLines(text), ...graph.value.notes] });
};
