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
import { addContext } from "./context.ts";
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

  it("marks a step that did not work, so it is not shown as done", async () => {
    await appendChat(projectDir(projectsDir, "sign-in"), [said("user", "It looks good.")]);
    const { client } = fakeLlm(
      [],
      [
        { text: "", toolCalls: [{ id: "1", name: T.approveGate, input: { gate: "script" } }] },
        { text: "The graph comes first.", toolCalls: [] },
      ],
    );
    await runAssistant({ context, client, slug: "sign-in", gate: "graph" });
    const step = (await chat()).find((m) => m.kind === "step");
    expect(step?.text).toMatch(/^Could not approve the gate/);
    expect(step?.failed).toBe(true);
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
      "I can't answer yet: no API key for openrouter.ai; add one in Settings. Check the LLM in Settings; until then, you can make the video in the panel on the right.",
    );
  });

  it("tells the model the gate the project is at, not the one the user is looking back at", async () => {
    await appendChat(projectDir(projectsDir, "sign-in"), [said("user", "Change the title.")]);
    const { client, conversed } = fakeLlm([], [{ text: "Done.", toolCalls: [] }]);
    // The project is at the graph gate; the user looks at it from the script gate's address.
    await runAssistant({ context, client, slug: "sign-in", gate: "script" });
    expect(conversed[0]?.system).toContain("which is at the graph gate");
    expect((await chat()).at(-1)?.gate).toBe("script");
  });

  it("lists the user's context in the prompt, and reads a file of it when the model asks", async () => {
    await addContext(projectDir(projectsDir, "sign-in"), {
      name: "spec.md",
      text: "Sign-in uses Google and keeps a session for 30 days.",
    });
    await appendChat(projectDir(projectsDir, "sign-in"), [said("user", "Use my notes.")]);
    const { client, conversed } = fakeLlm(
      [],
      [
        { text: "", toolCalls: [{ id: "1", name: T.readContext, input: { name: "spec.md" } }] },
        { text: "Read it.", toolCalls: [] },
      ],
    );
    await runAssistant({ context, client, slug: "sign-in", gate: "graph" });
    expect(conversed[0]?.system).toContain("- spec.md (52 characters)");
    expect(conversed[1]?.messages.at(-1)).toEqual({
      role: "tool",
      results: [
        {
          id: "1",
          name: T.readContext,
          output: { name: "spec.md", text: "Sign-in uses Google and keeps a session for 30 days." },
        },
      ],
    });
  });

  it("says nothing of context when there is none", async () => {
    await appendChat(projectDir(projectsDir, "sign-in"), [said("user", "Hi.")]);
    const { client, conversed } = fakeLlm([], [{ text: "Hello.", toolCalls: [] }]);
    await runAssistant({ context, client, slug: "sign-in", gate: "graph" });
    expect(conversed[0]?.system).not.toContain("## Context");
  });
});
