import { describe, expect, it } from "vitest";
import graphJson from "../../examples/oauth-login/graph.json" with { type: "json" };
import { MAX_QUESTIONS } from "../schema/drafts.ts";
import { formatErrors } from "../schema/errors.ts";
import { parseGraph } from "../schema/graph.ts";
import { draftGraph } from "./drafting.ts";
import { fakeLlm } from "./fake-llm.testing.ts";
import { FIXTURES_DIR, fixtureClient } from "./fixtures.ts";
import { DRAFTED_FLOWS } from "./recordings.ts";

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
