import { describe, expect, it } from "vitest";
import { formatErrors } from "../schema/errors.ts";
import { type AgentTool, MAX_AGENT_STEPS, runAgent } from "./agent.ts";
import { fakeLlm } from "./fake-llm.testing.ts";

const greet = (runs: unknown[]): AgentTool => ({
  name: "greet",
  description: "Greets someone.",
  inputSchema: { type: "object", properties: { name: { type: "string" } } },
  run: async (input) => {
    runs.push(input);
    return { greeted: (input as { name: string }).name };
  },
});

const call = (id: string, name: string, input: unknown) => ({ id, name, input });

describe("runAgent", () => {
  it("runs the tools the model calls, gives it their results, and stops at its text", async () => {
    const runs: unknown[] = [];
    const { client, conversed } = fakeLlm(
      [],
      [
        { text: "", toolCalls: [call("c1", "greet", { name: "Ada" })] },
        { text: "I greeted Ada.", toolCalls: [] },
      ],
    );
    const steps: string[] = [];
    const result = await runAgent({
      client,
      name: "chat",
      system: "You greet.",
      history: [{ role: "user", content: "Greet Ada." }],
      tools: [greet(runs)],
      onStep: (step) => {
        steps.push(`${step.call.name}:${JSON.stringify(step.output)}`);
      },
    });
    expect(result).toEqual({ ok: true, value: { reply: "I greeted Ada." } });
    expect(runs).toEqual([{ name: "Ada" }]);
    expect(steps).toEqual(['greet:{"greeted":"Ada"}']);
    expect(conversed[1]?.messages.slice(1)).toEqual([
      { role: "assistant", content: "", toolCalls: [call("c1", "greet", { name: "Ada" })] },
      { role: "tool", results: [{ id: "c1", name: "greet", output: { greeted: "Ada" } }] },
    ]);
    expect(conversed[0]?.tools.map((t) => t.name)).toEqual(["greet"]);
  });

  it("answers a call to a tool it does not have with an error the model can read", async () => {
    const { client, conversed } = fakeLlm(
      [],
      [
        { text: "", toolCalls: [call("c1", "wave", {})] },
        { text: "Sorry.", toolCalls: [] },
      ],
    );
    await runAgent({ client, name: "chat", system: "", history: [], tools: [greet([])] });
    expect(conversed[1]?.messages.at(-1)).toEqual({
      role: "tool",
      results: [
        { id: "c1", name: "wave", output: { error: 'no tool "wave"; the tools are: greet' } },
      ],
    });
  });

  it(`stops after ${MAX_AGENT_STEPS} steps without an answer`, async () => {
    const { client } = fakeLlm(
      [],
      Array.from({ length: MAX_AGENT_STEPS }, (_, i) => ({
        text: "",
        toolCalls: [call(`c${i}`, "greet", { name: "Ada" })],
      })),
    );
    const result = await runAgent({
      client,
      name: "chat",
      system: "",
      history: [],
      tools: [greet([])],
    });
    expect(result.ok ? [] : formatErrors(result.errors)).toEqual([
      `agent: stopped after ${MAX_AGENT_STEPS} steps without an answer`,
    ]);
  });

  it("stops at a failed call, with its reason", async () => {
    const { client } = fakeLlm(
      [],
      [{ error: "no API key for openrouter.ai; add one in Settings" }],
    );
    const result = await runAgent({ client, name: "chat", system: "", history: [], tools: [] });
    expect(result.ok ? [] : formatErrors(result.errors)).toEqual([
      "llm: no API key for openrouter.ai; add one in Settings",
    ]);
  });
});
