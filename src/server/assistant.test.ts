import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import graphJson from "../../examples/oauth-login/graph.json" with { type: "json" };
import { fakeTts } from "../audio/fake-tts.testing.ts";
import { fakeLlm } from "../llm/fake-llm.testing.ts";
import { AGENT_TOOL_NAMES as T } from "../mcp/agent-tools.ts";
import type { ToolContext } from "../mcp/tools.ts";
import { RenderQueue } from "../render/queue.ts";
import type { ServerEvent } from "../schema/api.ts";
import { runAssistant } from "./assistant.ts";
import { appendChat, readChat } from "./chat.ts";
import { createEvents } from "./events.ts";
import { makeProject, projectDir } from "./projects.ts";

const NOW = new Date("2026-11-24T12:00:00.000Z");
const { $schema: _g, ...graph } = graphJson;

let projectsDir: string;
let context: ToolContext;
let published: ServerEvent[];
beforeEach(async () => {
  projectsDir = mkdtempSync(join(tmpdir(), "explain-it-assistant-"));
  published = [];
  const events = createEvents();
  events.subscribe((e) => published.push(e));
  context = {
    projectsDir,
    now: () => NOW,
    events,
    previewUrl: (slug) => `http://127.0.0.1:3000/#/projects/${slug}`,
    missingRenderTools: async () => [],
    runChecks: async () => {
      throw new Error("not checking");
    },
    tts: fakeTts().tts,
    renders: new RenderQueue({
      now: () => NOW,
      run: async () => {
        throw new Error("not rendering");
      },
    }),
  };
  await makeProject(projectsDir, { name: "Sign in", origin: "web" }, NOW);
});
afterEach(() => rmSync(projectsDir, { recursive: true, force: true }));

const said = (role: "user" | "assistant", text: string, kind?: "step") => ({
  role,
  text,
  gate: "graph" as const,
  at: NOW.toISOString(),
  ...(kind ? { kind } : {}),
});
const chat = async () => (await readChat(projectDir(projectsDir, "sign-in"))).messages;

describe("runAssistant", () => {
  it("answers the user's message with the project's tools, a line for each change, then its reply", async () => {
    await appendChat(projectDir(projectsDir, "sign-in"), [
      said("user", "Explain how sign-in works."),
    ]);
    const { client, conversed } = fakeLlm(
      [],
      [
        { text: "", toolCalls: [{ id: "1", name: T.updateGraph, input: { graph } }] },
        { text: "Here is the graph. Does it look right?", toolCalls: [] },
      ],
    );
    await runAssistant({ context, client, slug: "sign-in", gate: "graph" });
    expect((await chat()).map((m) => [m.role, m.kind ?? "", m.text])).toEqual([
      ["user", "", "Explain how sign-in works."],
      ["assistant", "step", "Saved the graph."],
      ["assistant", "", "Here is the graph. Does it look right?"],
    ]);
    expect(published.filter((e) => e.type === "chat")).toHaveLength(2);
    const system = conversed[0]?.system ?? "";
    expect(system).toContain('the project "sign-in"');
    expect(system).toContain("## Steps");
  });

  it("reads back the conversation without its step lines", async () => {
    await appendChat(projectDir(projectsDir, "sign-in"), [
      said("user", "Explain sign-in."),
      said("assistant", "Saved the graph.", "step"),
      said("assistant", "Does the graph look right?"),
      said("user", "Yes."),
    ]);
    const { client, conversed } = fakeLlm([], [{ text: "Approved.", toolCalls: [] }]);
    await runAssistant({ context, client, slug: "sign-in", gate: "graph" });
    expect(conversed[0]?.messages).toEqual([
      { role: "user", content: "Explain sign-in." },
      { role: "assistant", content: "Does the graph look right?", toolCalls: [] },
      { role: "user", content: "Yes." },
    ]);
  });

  it("says plainly when there is no LLM to answer, and what works instead", async () => {
    await appendChat(projectDir(projectsDir, "sign-in"), [said("user", "Hello")]);
    const { client } = fakeLlm(
      [],
      [{ error: "no API key for openrouter.ai; add one in Settings" }],
    );
    await runAssistant({ context, client, slug: "sign-in", gate: "graph" });
    expect((await chat()).at(-1)?.text).toBe(
      "I can't answer yet: no API key for openrouter.ai; add one in Settings. Until then, you can make the video in the panel on the right.",
    );
  });
});
