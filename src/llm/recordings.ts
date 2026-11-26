import exampleGraphJson from "../../examples/oauth-login/graph.json" with { type: "json" };
import exampleStoryboardJson from "../../examples/oauth-login/storyboard.json" with {
  type: "json",
};
import { canonical } from "../checks/fixes.ts";
import { categoryColours } from "../engine/theme/categories.ts";
import { graphSummary } from "../guidance/guide.ts";
import { DEFAULT_CONFIG } from "../schema/config.ts";
import { orThrow, type Validated } from "../schema/errors.ts";
import { type Graph, GraphSchema, MAX_NODE_LABEL, parseGraph } from "../schema/graph.ts";
import { ok } from "../schema/result.ts";
import { BriefSchema } from "../schema/story.ts";
import { parseStoryboard, type Storyboard } from "../schema/storyboard.ts";
import type { LlmClient } from "./client.ts";
import { draftGraph, draftScript } from "./drafting.ts";
import { editFile, repairLayout } from "./editing.ts";
import { type StructuredCall, structuredCall } from "./structured.ts";
import { shorterWords } from "./words.ts";

/**
 * The calls recorded with a real model (`npm run llm:record`) and replayed
 * in tests, so the client, the repair loop and the fixtures are shown to
 * work end to end with no key. Each is small: a graph and a story brief for
 * one described flow, and shorter words for a line read too fast (5.8). The
 * drafting slices (5.3, 5.4) record their own.
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

/** The oauth-login example's line that the quick checks find goes by too fast to read. */
export const RUSHED_LINE = {
  kind: "words",
  beat: "code",
  field: "say",
  why: "read",
  text: "The provider redirects back with a short-lived, one-time code.",
  most: 55,
} as const;
export const RUSHED_ABOUT = 'the scene "Sign in" of the video "Signing in with OAuth"';

/** Three described flows, each drafted into a graph (5.3's "Done when"). */
export const DRAFTED_FLOWS = [
  {
    name: "password reset",
    request: FLOW,
    brief: {
      version: 1,
      audience: "People who use the app",
      takeaway: "A reset link works once, and only for a short time.",
      shape: "problem",
      hook: "You forgot your password. Here is how you get back in.",
    },
  },
  {
    name: "a CI pipeline",
    request:
      "Explain our CI pipeline: a developer pushes a branch to GitHub, GitHub Actions runs the lint, the tests and a build in parallel, and when all pass it publishes a Docker image to the registry and deploys it to staging.",
    brief: {
      version: 1,
      audience: "Developers new to the team",
      takeaway: "Nothing reaches staging unless the lint, the tests and the build all pass.",
      shape: "zoom",
    },
  },
  {
    name: "checkout",
    request:
      "Show how checkout works in our shop: the shopper pays in the web app, the order service reserves the stock, the payment provider takes the payment, and the shopper gets an email when the order is confirmed.",
    brief: {
      version: 1,
      audience: "The support team",
      takeaway: "Stock is held before the payment is taken, so a paid order never runs out.",
      shape: "problem",
    },
  },
] as const;

/** The script drafted for each of those graphs, following a brief agreed first (5.4's "Done when"). */
export const DRAFTED_SCRIPTS = DRAFTED_FLOWS.map((flow) => ({
  name: flow.name,
  run: async (client: LlmClient) => {
    const drafted = await draftGraph(client, { request: flow.request, context: [] });
    if (!drafted.ok) return drafted;
    const script = await draftScript(client, {
      request: `Write the script for this flow: ${flow.request}`,
      context: [],
      graph: drafted.value.graph,
      brief: flow.brief,
      config: DEFAULT_CONFIG,
    });
    return script.ok ? ok({ graph: drafted.value.graph, script: script.value }) : script;
  },
}));

const exampleGraph = orThrow(parseGraph(exampleGraphJson), "graph.json");
/** The example's palette (default), as a graph edit sees it. */
const EXAMPLE_COLOURS = orThrow(categoryColours("default"), "palette");
const exampleScript = orThrow(
  parseStoryboard(exampleStoryboardJson, exampleGraph),
  "storyboard.json",
);
const beatsOf = (storyboard: Storyboard) => storyboard.scenes.flatMap((s) => s.beats);
const sameIds = <T extends { id: string }>(before: readonly T[], after: readonly T[]) =>
  before.every((b) => after.some((a) => a.id === b.id));

/** The edits 5.5's "Done when" names, on the oauth-login example, each with what must hold after it. */
export const EDITS = [
  {
    request: "Rename the identity provider to Google.",
    file: "graph",
    holds: (result: Graph | Storyboard) =>
      "nodes" in result &&
      sameIds(exampleGraph.nodes, result.nodes) &&
      result.nodes.some((n) => n.id === "idp" && n.label.includes("Google")),
  },
  {
    request:
      "Add a retry step: when swapping the code for a token fails, the app asks the provider again.",
    file: "graph",
    holds: (result: Graph | Storyboard) =>
      "nodes" in result &&
      sameIds(exampleGraph.nodes, result.nodes) &&
      sameIds(exampleGraph.edges, result.edges) &&
      result.edges.length > exampleGraph.edges.length,
  },
  {
    // By its colour: only the palette's colours say pink is c4 (#be185d in the default palette).
    request: "Make the identity provider pink.",
    file: "graph",
    holds: (result: Graph | Storyboard) =>
      "nodes" in result &&
      canonical(result.nodes.filter((n) => n.id !== "idp")) ===
        canonical(exampleGraph.nodes.filter((n) => n.id !== "idp")) &&
      result.nodes.some((n) => n.id === "idp" && n.category === "c4"),
  },
  {
    request: "Shorten beat 3.",
    file: "storyboard",
    holds: (result: Graph | Storyboard) => {
      if (!("scenes" in result)) return false;
      const [before, after] = [beatsOf(exampleScript), beatsOf(result)];
      const length = (b: Storyboard["scenes"][number]["beats"][number] | undefined) =>
        (b?.say ?? "").length + (b?.caption ?? "").length;
      return (
        length(after[2]) < length(before[2]) &&
        before.every((b, i) => i === 2 || canonical(b) === canonical(after[i]))
      );
    },
  },
].map((edit) => ({
  ...edit,
  run: (client: LlmClient) =>
    editFile(
      client,
      edit.file === "graph"
        ? { file: "graph", request: edit.request, graph: exampleGraph, colours: EXAMPLE_COLOURS }
        : {
            file: "storyboard",
            request: edit.request,
            graph: exampleGraph,
            storyboard: exampleScript,
          },
    ),
}));

/** Longer labels for the example's first nodes, at most as long as a label may be. */
const LONG_LABELS = [
  "The person signing in",
  "Their web browser window",
  "Our photo sharing app",
  "Session store database",
  "Photos storage API svc",
  "Outside identity service",
];

/**
 * A crowded project (5.6's "Done when"): the oauth-login example with long
 * labels, and every node and beat in one scene. Chrome's layout checks find
 * edge labels on badges and on a zone's label (`src/render/repair.test.ts`).
 */
export const crowded = (): { graph: Graph; storyboard: Storyboard } => {
  const graph = orThrow(
    parseGraph({
      ...exampleGraph,
      nodes: exampleGraph.nodes.map((n, i) => ({ ...n, label: LONG_LABELS[i] ?? n.label })),
      edges: exampleGraph.edges.map((e) =>
        e.label ? { ...e, label: `${e.label} with details`.slice(0, MAX_NODE_LABEL) } : e,
      ),
    }),
    "the crowded graph",
  );
  const storyboard = orThrow(
    parseStoryboard(
      {
        ...exampleScript,
        scenes: [
          {
            ...exampleScript.scenes[0],
            nodes: graph.nodes.map((n) => n.id),
            beats: exampleScript.scenes.flatMap((s) => s.beats),
          },
        ],
      },
      graph,
    ),
    "the crowded script",
  );
  return { graph, storyboard };
};

/** What Chrome's layout checks found in the crowded project, as the chat says it. */
export const CROWDED_PROBLEMS = [
  'In beat "swap", zone "backend"\'s label is covered by the label of edge "exchange" by 11.9 px.',
  'In beat "token", zone "backend"\'s label is covered by the label of edge "exchange" by 11.9 px.',
  'In beat "session", the label of edge "callback" and badge on "app" overlap by 6.5 px.',
  'In beat "fetch", the label of edge "fetch" and badge on "app" overlap by 26.2 px.',
  'In beat "done", the label of edge "fetch" and badge on "app" overlap by 26.2 px.',
];

/** The recorded calls, each run with its own schema. */
export const RECORDED_CALLS: readonly {
  readonly name: string;
  readonly run: (client: LlmClient) => Promise<Validated<unknown>>;
}[] = [
  { name: graphCall.name, run: (client) => structuredCall(client, graphCall) },
  { name: briefCall.name, run: (client) => structuredCall(client, briefCall) },
  { name: "shorter-words", run: (client) => shorterWords(client, RUSHED_LINE, RUSHED_ABOUT) },
  ...DRAFTED_FLOWS.map((flow) => ({
    name: `draft-graph: ${flow.name}`,
    run: (client: LlmClient) => draftGraph(client, { request: flow.request, context: [] }),
  })),
  ...DRAFTED_SCRIPTS.map((flow) => ({ name: `draft-script: ${flow.name}`, run: flow.run })),
  ...EDITS.map((edit) => ({ name: `edit: ${edit.request}`, run: edit.run })),
  {
    name: "repair-layout: crowded",
    run: (client: LlmClient) => repairLayout(client, { ...crowded(), problems: CROWDED_PROBLEMS }),
  },
];
