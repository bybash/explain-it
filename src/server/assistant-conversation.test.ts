import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FIXTURES_DIR, fixtureClient } from "../llm/fixtures.ts";
import { CONVERSATION, playConversation } from "./assistant-conversation.ts";
import { openProject } from "./projects.ts";

let projectsDir: string;
beforeEach(() => {
  projectsDir = mkdtempSync(join(tmpdir(), "explain-it-conversation-"));
});
afterEach(() => rmSync(projectsDir, { recursive: true, force: true }));

describe("the recorded conversation", () => {
  it("goes from a described flow to an approved graph and script through the assistant's tools alone, with no key", async () => {
    const { slug, chat } = await playConversation(
      fixtureClient({ dir: FIXTURES_DIR }),
      projectsDir,
    );
    const opened = await openProject(projectsDir, slug);
    if (!opened?.ok) throw new Error("the project does not open");
    const { project, graph, brief, storyboard, problems } = opened.value;
    expect(problems).toEqual([]);
    expect(graph?.nodes.length).toBeGreaterThan(2);
    expect(brief).not.toBeNull();
    expect(storyboard?.scenes.length).toBeGreaterThan(0);
    expect(project.gate).toBe("style");
    // Every message has its answer, and no answer is a failure.
    const replies = chat.filter((m) => m.role === "assistant" && m.kind !== "step");
    expect(replies).toHaveLength(CONVERSATION.length);
    for (const reply of replies) {
      expect(reply.text).not.toMatch(/^I can't answer yet/);
      // The panel shows the graph: it is never pasted into the chat as Mermaid.
      expect(reply.text).not.toMatch(/```|flowchart (LR|RL|TB|TD|BT)/);
    }
    expect(chat.filter((m) => m.kind === "step").map((m) => m.text)).toEqual(
      expect.arrayContaining(["Approved the graph gate.", "Approved the script gate."]),
    );
  }, 60_000);
});
