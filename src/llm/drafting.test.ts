import { describe, expect, it } from "vitest";
import graphJson from "../../examples/oauth-login/graph.json" with { type: "json" };
import storyboardJson from "../../examples/oauth-login/storyboard.json" with { type: "json" };
import { DEFAULT_CONFIG } from "../schema/config.ts";
import { MAX_QUESTIONS } from "../schema/drafts.ts";
import { formatErrors, orThrow } from "../schema/errors.ts";
import { parseGraph } from "../schema/graph.ts";
import { parseStoryboard } from "../schema/storyboard.ts";
import { draftGraph, draftScript, editFile, repairLayout } from "./drafting.ts";
import { fakeLlm } from "./fake-llm.testing.ts";
import { FIXTURES_DIR, fixtureClient } from "./fixtures.ts";
import { CROWDED_PROBLEMS, crowded, DRAFTED_FLOWS, DRAFTED_SCRIPTS, EDITS } from "./recordings.ts";

const { $schema: _, ...graph } = graphJson;
const answer = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    graph,
    assumptions: ["The user signs in with Google."],
    questions: [],
    ...over,
  });

describe("draftGraph", () => {
  it("drafts a graph from what the user described, with its assumptions and questions", async () => {
    const { client, asked } = fakeLlm([answer({ questions: ["Is the app a web app or mobile?"] })]);
    const drafted = await draftGraph(client, {
      request: "Explain OAuth login.",
      context: [{ name: "notes.md", text: "We use Google as the identity provider." }],
      houseRules: "Always call the app Photos.",
    });
    expect(drafted.ok && drafted.value.questions).toEqual(["Is the app a web app or mobile?"]);
    const sent = asked[0];
    // The guide's graph section, the house rules and the context all reach the model.
    expect(sent?.system).toContain("graph.json: the structure");
    expect(sent?.system).toContain("Always call the app Photos.");
    expect(sent?.messages[0]?.content).toContain("We use Google as the identity provider.");
    expect(sent?.messages[0]?.content).toContain("Explain OAuth login.");
    expect(sent?.system).not.toMatch(/\{\{/);
  });

  it("sends back a graph that does not hold together, and more questions than it may ask", async () => {
    const broken = { ...graph, edges: [{ id: "x", from: "nobody", to: "app" }] };
    const { client, asked } = fakeLlm([
      answer({ graph: broken }),
      answer({ questions: ["a?", "b?", "c?"] }),
      answer(),
    ]);
    const drafted = await draftGraph(client, { request: "Explain OAuth login.", context: [] });
    expect(drafted.ok).toBe(true);
    expect(asked).toHaveLength(3);
    expect(asked[1]?.messages.at(-1)?.content).toMatch(/nobody/);
    expect(asked[2]?.messages.at(-1)?.content).toMatch(new RegExp(`${MAX_QUESTIONS}`));
  });

  it.each(DRAFTED_FLOWS.map((flow) => [flow.name, flow] as const))(
    "drafts a valid graph for %s, as recorded with a real model",
    async (_name, flow) => {
      const drafted = await draftGraph(fixtureClient({ dir: FIXTURES_DIR }), {
        request: flow.request,
        context: [],
      });
      expect(drafted.ok ? [] : formatErrors(drafted.errors)).toEqual([]);
      if (!drafted.ok) return;
      expect(parseGraph(drafted.value.graph).ok).toBe(true);
      expect(drafted.value.graph.nodes.length).toBeGreaterThanOrEqual(3);
      expect(drafted.value.questions.length).toBeLessThanOrEqual(MAX_QUESTIONS);
    },
  );
});

describe("draftScript", () => {
  const parsedGraph = orThrow(parseGraph(graph), "graph.json");
  const { $schema: _s, ...example } = storyboardJson;
  type Script = typeof example;
  /** The script with one beat's line replaced, by its place in the first scene. */
  const saying = (from: Script, beat: number, say: string): Script => ({
    ...from,
    scenes: from.scenes.map((scene, i) =>
      i === 0
        ? { ...scene, beats: scene.beats.map((b, j) => (j === beat ? { ...b, say } : b)) }
        : scene,
    ),
  });
  // The example's fourth line reads a little fast by an estimate of its voice; this one fits.
  const storyboard = saying(example, 3, "The provider sends back a one-time code.");
  const LONG_HOOK =
    "A user opens the app on their phone, taps Sign in, and waits while the app gets ready to send them to the provider.";
  const titleCard = { title: "Signing in with OAuth" };
  const script = (over: Record<string, unknown> = {}) =>
    JSON.stringify({ storyboard, titleCard, assumptions: [], ...over });
  const input = {
    request: "Write the script.",
    context: [],
    graph: parsedGraph,
    brief: null,
    config: DEFAULT_CONFIG,
  };

  it("sends back a script that names what the graph lacks, or a hook too long, then takes the repaired one", async () => {
    const strayed = {
      ...storyboard,
      scenes: storyboard.scenes.map((scene, i) =>
        i === 0 ? { ...scene, nodes: [...scene.nodes, "nobody"] } : scene,
      ),
    };
    const slow = saying(storyboard, 0, LONG_HOOK);
    const { client, asked } = fakeLlm([
      script({ storyboard: strayed }),
      script({ storyboard: slow }),
      script(),
    ]);
    const drafted = await draftScript(client, input);
    expect(drafted.ok && drafted.value.remaining).toEqual([]);
    expect(drafted.ok && drafted.value.draft.titleCard).toEqual(titleCard);
    expect(asked[1]?.messages.at(-1)?.content).toMatch(/nobody/);
    expect(asked[2]?.messages.at(-1)?.content).toMatch(
      /storyboard\.scenes\[0\]\.beats\[0\]: the first beat takes/,
    );
    // The graph and the guide's part on the script reach the model.
    expect(asked[0]?.messages[0]?.content).toContain('"title":"Signing in with OAuth"');
    expect(asked[0]?.system).toContain("Telling the story");
  });

  it("keeps a script that fits the graph when the repairs run out, with what is left", async () => {
    const slow = saying(storyboard, 0, LONG_HOOK);
    const { client } = fakeLlm([
      script({ storyboard: slow }),
      script({ storyboard: slow }),
      script({ storyboard: slow }),
    ]);
    const drafted = await draftScript(client, input);
    expect(drafted.ok && drafted.value.remaining.map((e) => e.path)).toEqual([
      "storyboard.scenes[0].beats[0]",
    ]);
  });

  it.each(DRAFTED_SCRIPTS.map((flow) => [flow.name, flow] as const))(
    "drafts a valid script for the graph of %s, as recorded with a real model",
    async (_name, flow) => {
      const client = fixtureClient({ dir: FIXTURES_DIR });
      const drafted = await flow.run(client);
      expect(drafted.ok ? [] : formatErrors(drafted.errors)).toEqual([]);
      if (!drafted.ok) return;
      const { graph: drafts, script: written } = drafted.value;
      expect(parseStoryboard(written.draft.storyboard, drafts).ok).toBe(true);
      expect(written.remaining).toEqual([]);
    },
  );
});

describe("editFile", () => {
  const parsedGraph = orThrow(parseGraph(graph), "graph.json");

  it("turns what the user asked into a JSON Patch on the file, and sends back one that breaks it", async () => {
    const { client, asked } = fakeLlm([
      JSON.stringify({ patch: [{ op: "remove", path: "/nodes/0" }], summary: "Removed the user." }),
      JSON.stringify({
        patch: [{ op: "replace", path: "/nodes/5/label", value: '"Google"' }],
        summary: "Renamed the identity provider to Google.",
      }),
    ]);
    const edited = await editFile(client, {
      file: "graph",
      request: "Rename the identity provider to Google.",
      graph: parsedGraph,
    });
    expect(edited.ok && edited.value.summary).toBe("Renamed the identity provider to Google.");
    expect(edited.ok && edited.value.patch).toEqual([
      { op: "replace", path: "/nodes/5/label", value: "Google" },
    ]);
    // Removing a node an edge still names breaks the graph: the errors go back.
    expect(asked[1]?.messages.at(-1)?.content).toMatch(/graph/);
    expect(asked[0]?.messages[0]?.content).toContain('"id":"idp"');
  });

  it.each(EDITS.map((edit) => [edit.request, edit] as const))(
    "makes the edit %s, as recorded with a real model",
    async (_request, edit) => {
      const edited = await edit.run(fixtureClient({ dir: FIXTURES_DIR }));
      expect(edited.ok ? [] : formatErrors(edited.errors)).toEqual([]);
      if (edited.ok) expect(edit.holds(edited.value.result)).toBe(true);
    },
  );
});

describe("repairLayout", () => {
  it("sends back a repair that names what is not there, and takes shorter labels", async () => {
    const { client, asked } = fakeLlm([
      JSON.stringify({ labels: [{ id: "nobody", label: "X" }], storyboardPatch: [], summary: "?" }),
      JSON.stringify({ labels: [], storyboardPatch: [], summary: "Nothing." }),
      JSON.stringify({
        labels: [{ id: "exchange", label: "swap code" }],
        storyboardPatch: [],
        summary: "Shortened the exchange's label.",
      }),
    ]);
    const repaired = await repairLayout(client, { ...crowded(), problems: CROWDED_PROBLEMS });
    expect(repaired.ok && repaired.value.graph.edges.find((e) => e.id === "exchange")?.label).toBe(
      "swap code",
    );
    expect(asked[1]?.messages.at(-1)?.content).toMatch(/no node, edge or zone "nobody"/);
    expect(asked[2]?.messages.at(-1)?.content).toMatch(/changes nothing/);
    expect(asked[0]?.messages[0]?.content).toContain(CROWDED_PROBLEMS[0]);
  });

  it("repairs the crowded project with labels and scenes only, as recorded with a real model", async () => {
    const before = crowded();
    const repaired = await repairLayout(fixtureClient({ dir: FIXTURES_DIR }), {
      ...before,
      problems: CROWDED_PROBLEMS,
    });
    expect(repaired.ok ? [] : formatErrors(repaired.errors)).toEqual([]);
    if (!repaired.ok) return;
    // Nothing but labels changes in the graph: every id, kind and zone stays.
    const shape = (g: typeof before.graph) =>
      JSON.stringify([
        g.nodes.map(({ label: _, ...n }) => n),
        g.edges.map(({ label: _, ...e }) => e),
      ]);
    expect(shape(repaired.value.graph)).toBe(shape(before.graph));
  });
});
