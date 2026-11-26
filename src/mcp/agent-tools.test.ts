import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import graphJson from "../../examples/oauth-login/graph.json" with { type: "json" };
import storyboardJson from "../../examples/oauth-login/storyboard.json" with { type: "json" };
import { fakeTts } from "../audio/fake-tts.testing.ts";
import { runAgent } from "../llm/agent.ts";
import { fakeLlm } from "../llm/fake-llm.testing.ts";
import { RenderQueue } from "../render/queue.ts";
import type { ServerEvent } from "../schema/api.ts";
import { createEvents } from "../server/events.ts";
import { makeProject, projectDir } from "../server/projects.ts";
import { agentTools, AGENT_TOOL_NAMES as T } from "./agent-tools.ts";
import type { ToolContext } from "./tools.ts";

const NOW = new Date("2026-11-24T12:00:00.000Z");
const { $schema: _g, ...graph } = graphJson;
const { $schema: _s, ...storyboard } = storyboardJson;

let projectsDir: string;
let context: ToolContext;
let published: ServerEvent[];
beforeEach(async () => {
  projectsDir = mkdtempSync(join(tmpdir(), "explain-it-agent-"));
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
      throw new Error("not checking in these tests");
    },
    tts: fakeTts().tts,
    renders: new RenderQueue({
      now: () => NOW,
      run: async () => {
        throw new Error("not rendering in these tests");
      },
    }),
  };
  await makeProject(projectsDir, { name: "Sign in", origin: "web" }, NOW);
});
afterEach(() => rmSync(projectsDir, { recursive: true, force: true }));

const read = (file: string) => JSON.parse(readFileSync(join(projectsDir, "sign-in", file), "utf8"));
const call = (id: string, name: string, input: unknown) => ({ id, name, input });
/** A file of context, as the user adds it. */
const addContext = (dir: string, name: string, text: string) => {
  mkdirSync(join(dir, "context"), { recursive: true });
  writeFileSync(join(dir, "context", name), text);
};

describe("agentTools", () => {
  it("lets the agent draft the graph, the brief and the script, and approve each gate, on its own project", async () => {
    const outputs: Record<string, unknown> = {};
    const { client, conversed } = fakeLlm(
      [],
      [
        { text: "", toolCalls: [call("1", T.updateGraph, { graph })] },
        { text: "", toolCalls: [call("2", T.approveGate, { gate: "graph" })] },
        {
          text: "",
          toolCalls: [call("3", T.setBrief, { brief: { version: 1, shape: "problem" } })],
        },
        { text: "", toolCalls: [call("4", T.setStoryboard, { storyboard })] },
        { text: "", toolCalls: [call("5", T.approveGate, { gate: "script" })] },
        { text: "Done: the graph and the script are approved.", toolCalls: [] },
      ],
    );
    const result = await runAgent({
      client,
      name: "chat",
      system: "",
      history: [{ role: "user", content: "Go." }],
      tools: agentTools(context, "sign-in", client),
      onStep: ({ call, output }) => {
        outputs[call.id] = output;
      },
    });
    expect(result).toEqual({
      ok: true,
      value: { reply: "Done: the graph and the script are approved." },
    });
    expect(read("graph.json").title).toBe(graph.title);
    expect(read("brief.json")).toEqual({ version: 1, shape: "problem" });
    expect(read("storyboard.json").scenes).toHaveLength(storyboard.scenes.length);
    expect(read("project.json").gate).toBe("style");
    expect(outputs["5"]).toEqual({ approved: "script", gate: "style" });
    expect(published).toContainEqual({ type: "project-updated", slug: "sign-in" });
    // The tool the agent never names: the slug is the chat's own.
    expect(JSON.stringify(conversed[0]?.tools)).not.toContain('"slug"');
  });

  it("gives back errors by place, and leaves out links and times the agent has no use for", async () => {
    const outputs: Record<string, unknown> = {};
    const { client } = fakeLlm(
      [],
      [
        {
          text: "",
          toolCalls: [
            call("bad", T.updateGraph, { graph: { ...graph, nodes: [] } }),
            call("early", T.approveGate, { gate: "script" }),
            call("read", T.getProject, {}),
          ],
        },
        { text: "Fixing it.", toolCalls: [] },
      ],
    );
    await runAgent({
      client,
      name: "chat",
      system: "",
      history: [],
      tools: agentTools(context, "sign-in", client),
      onStep: ({ call, output }) => {
        outputs[call.id] = output;
      },
    });
    expect((outputs.bad as { errors: string[] }).errors[0]).toMatch(/^graph\./);
    expect(outputs.early).toEqual({
      errors: ["gate: the project is at the graph gate, not script"],
    });
    const project = JSON.stringify(outputs.read);
    expect(project).toContain('"gate":"graph"');
    for (const field of ["preview", "createdAt", "updatedAt"]) expect(project).not.toContain(field);
  });

  it("drafts the graph from the description and the context it names, saves it, and says what it assumed", async () => {
    addContext(projectDir(projectsDir, "sign-in"), "idp.md", "We use Google.");
    const outputs: Record<string, unknown> = {};
    const { client, asked } = fakeLlm(
      [
        JSON.stringify({
          graph,
          assumptions: ["Google is the identity provider."],
          questions: ["Web or mobile?"],
        }),
      ],
      [
        {
          text: "",
          toolCalls: [
            call("d", T.draftGraph, { request: "Explain OAuth login.", context: ["idp.md"] }),
          ],
        },
        { text: "Drafted.", toolCalls: [] },
      ],
    );
    await runAgent({
      client,
      name: "chat",
      system: "",
      history: [],
      tools: agentTools(context, "sign-in", client),
      onStep: ({ call, output }) => {
        outputs[call.id] = output;
      },
    });
    expect(asked[0]?.messages[0]?.content).toContain("We use Google.");
    expect(read("graph.json").title).toBe(graph.title);
    expect(outputs.d).toMatchObject({
      assumptions: ["Google is the identity provider."],
      questions: ["Web or mobile?"],
    });
    expect(JSON.stringify(outputs.d)).not.toContain("mermaid");
    expect(published).toContainEqual({ type: "project-updated", slug: "sign-in" });
  });

  it("refuses to draft from a context file that is not there, and drafts nothing", async () => {
    const outputs: Record<string, unknown> = {};
    const { client, asked } = fakeLlm(
      [],
      [
        {
          text: "",
          toolCalls: [call("d", T.draftGraph, { request: "Go.", context: ["nope.md"] })],
        },
        { text: "Sorry.", toolCalls: [] },
      ],
    );
    await runAgent({
      client,
      name: "chat",
      system: "",
      history: [],
      tools: agentTools(context, "sign-in", client),
      onStep: ({ call, output }) => {
        outputs[call.id] = output;
      },
    });
    expect(outputs.d).toEqual({ errors: ['name: no context file "nope.md"'] });
    expect(asked).toHaveLength(0);
  });

  it("drafts the script only once a brief is agreed, then saves it with a title card to suggest", async () => {
    const outputs: Record<string, unknown> = {};
    const script = JSON.stringify({
      storyboard,
      titleCard: { title: "Signing in with OAuth" },
      assumptions: [],
    });
    const { client } = fakeLlm(
      [script, script, script],
      [
        { text: "", toolCalls: [call("g", T.updateGraph, { graph })] },
        { text: "", toolCalls: [call("early", T.draftScript, { request: "Write it." })] },
        {
          text: "",
          toolCalls: [call("b", T.setBrief, { brief: { version: 1, shape: "problem" } })],
        },
        { text: "", toolCalls: [call("s", T.draftScript, { request: "Write it." })] },
        { text: "Drafted.", toolCalls: [] },
      ],
    );
    await runAgent({
      client,
      name: "chat",
      system: "",
      history: [],
      tools: agentTools(context, "sign-in", client),
      onStep: ({ call, output }) => {
        outputs[call.id] = output;
      },
    });
    expect(outputs.early).toEqual({
      errors: [
        `brief.json: missing; agree the story with the user, and save it with ${T.setBrief}, first`,
      ],
    });
    expect(read("storyboard.json").scenes).toHaveLength(storyboard.scenes.length);
    expect(outputs.s).toMatchObject({ suggestedTitleCard: { title: "Signing in with OAuth" } });
  });

  it("changes the graph as the user asked, with a patch that keeps the rest, and says what changed", async () => {
    const outputs: Record<string, unknown> = {};
    const { client } = fakeLlm(
      [
        JSON.stringify({
          patch: [{ op: "replace", path: "/nodes/5/label", value: '"Google"' }],
          summary: "Renamed the identity provider to Google.",
        }),
      ],
      [
        { text: "", toolCalls: [call("g", T.updateGraph, { graph })] },
        {
          text: "",
          toolCalls: [
            call("e", T.editGraph, { request: "Rename the identity provider to Google." }),
          ],
        },
        { text: "Renamed.", toolCalls: [] },
      ],
    );
    await runAgent({
      client,
      name: "chat",
      system: "",
      history: [],
      tools: agentTools(context, "sign-in", client),
      onStep: ({ call, output }) => {
        outputs[call.id] = output;
      },
    });
    const saved = read("graph.json");
    expect(saved.nodes[5]).toMatchObject({ id: "idp", label: "Google" });
    expect(saved.nodes.map((n: { id: string }) => n.id)).toEqual(graph.nodes.map((n) => n.id));
    expect(outputs.e).toMatchObject({ summary: "Renamed the identity provider to Google." });
  });
});
