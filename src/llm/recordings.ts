import { graphSummary } from "../guidance/guide.ts";
import type { Validated } from "../schema/errors.ts";
import { GraphSchema, parseGraph } from "../schema/graph.ts";
import { BriefSchema } from "../schema/story.ts";
import type { LlmClient } from "./client.ts";
import { type StructuredCall, structuredCall } from "./structured.ts";

/**
 * The calls recorded with a real model (`npm run llm:record`) and replayed
 * in tests, so the client, the repair loop and the fixtures are shown to
 * work end to end with no key. Each is small: a graph and a story brief for
 * one described flow. The drafting slices (5.3, 5.4) record their own.
 */

const FLOW =
  "A user forgets their password. The web app looks up their account and emails them a one-time link; they open it and choose a new password.";

const graphCall = {
  name: "example-graph",
  system: `You write graph.json files for explAIn-it, which turns a flow into an explainer video. ${graphSummary()} Answer with the JSON object only.`,
  prompt: `Draft graph.json for this flow: ${FLOW}`,
  schema: GraphSchema,
  check: parseGraph,
} satisfies StructuredCall<typeof GraphSchema>;

const briefCall = {
  name: "example-brief",
  system:
    "You write the story brief for an explAIn-it video: who it is for, the one thing to remember, its shape and its hook. Answer with the JSON object only, version 1.",
  prompt: `Write a brief for a video about this flow, for people who use the app: ${FLOW}`,
  schema: BriefSchema,
} satisfies StructuredCall<typeof BriefSchema>;

/** The recorded calls, each run with its own schema. */
export const RECORDED_CALLS: readonly {
  readonly name: string;
  readonly run: (client: LlmClient) => Promise<Validated<unknown>>;
}[] = [
  { name: graphCall.name, run: (client) => structuredCall(client, graphCall) },
  { name: briefCall.name, run: (client) => structuredCall(client, briefCall) },
];
