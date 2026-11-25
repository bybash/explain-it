import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakeTts } from "../audio/fake-tts.testing.ts";
import { fakeLlm } from "../llm/fake-llm.testing.ts";
import type { CheckReport } from "../schema/checks.ts";
import { orThrow } from "../schema/errors.ts";
import { parseGraph } from "../schema/graph.ts";
import { readChat } from "./chat.ts";
import { checksChat } from "./checks-chat.ts";
import { createEvents } from "./events.ts";
import { copyExample } from "./example.testing.ts";
import { laidOut } from "./graphs.ts";

const NOW = "2026-11-25T12:00:00.000Z";
/** The example's line that the quick checks find goes by too fast (see RUSHED_LINE). */
const SHORTER = JSON.stringify({ text: "The provider sends back a one-time code." });

let projectsDir: string;
beforeEach(() => {
  projectsDir = mkdtempSync(join(tmpdir(), "explain-it-checks-chat-"));
  copyExample(projectsDir, "oauth");
});
afterEach(() => rmSync(projectsDir, { recursive: true, force: true }));

const dir = () => join(projectsDir, "oauth");
const read = (name: string) => JSON.parse(readFileSync(join(dir(), name), "utf8"));
const chat = async () => (await readChat(dir())).messages;

const make = (replies: Parameters<typeof fakeLlm>[0]) => {
  const { client, asked } = fakeLlm(replies);
  const events = createEvents();
  const published: string[] = [];
  events.subscribe((e) => published.push(e.type));
  const checks = checksChat({
    projectsDir,
    tts: fakeTts().tts,
    llm: client,
    events,
    now: () => new Date(NOW),
    wait: 0,
  });
  return { checks, asked, events, published };
};

describe("checksChat: the quick checks", () => {
  it("says a line read too fast in plain words, with shorter words to apply", async () => {
    const { checks } = make([SHORTER]);
    await checks.quick("oauth");
    const [message] = await chat();
    expect(message).toMatchObject({
      role: "assistant",
      kind: "checks",
      gate: read("project.json").gate,
    });
    expect(message?.found).toEqual([
      expect.objectContaining({
        beat: "code",
        text: 'The line of beat "code" goes by too fast to read.',
      }),
    ]);
    expect(message?.fixes).toEqual([
      expect.objectContaining({
        fix: {
          kind: "words",
          beat: "code",
          field: "say",
          before: "The provider redirects back with a short-lived, one-time code.",
          after: "The provider sends back a one-time code.",
        },
      }),
    ]);
    expect(message?.found?.[0]?.fix).toBe(message?.fixes?.[0]?.id);
    // Offered, not applied: these are the user's words.
    expect(
      read("storyboard.json").scenes[0].beats.find((b: { id: string }) => b.id === "code").say,
    ).toMatch(/redirects/);
  });

  it("posts nothing when nothing new is found", async () => {
    const { checks, asked } = make([SHORTER]);
    await checks.quick("oauth");
    await checks.quick("oauth");
    expect(await chat()).toHaveLength(1);
    expect(asked).toHaveLength(1);
  });

  it("reports the problem without a fix when the LLM cannot answer", async () => {
    const { checks } = make([{ error: "no API key in Settings" }]);
    await checks.quick("oauth");
    const [message] = await chat();
    expect(message?.found?.[0]).toMatchObject({ beat: "code" });
    expect(message?.found?.[0]?.fix).toBeUndefined();
    expect(message?.fixes ?? []).toEqual([]);
  });

  it("waits while the assistant works, then checks once it is done", async () => {
    const { checks, events } = make([SHORTER]);
    checks.busy("oauth");
    events.publish({ type: "project-updated", slug: "oauth" });
    await checks.settled("oauth");
    expect(await chat()).toEqual([]);
    checks.idle("oauth");
    await checks.settled("oauth");
    expect(await chat()).toHaveLength(1);
  });
});

describe("checksChat: the full checks", () => {
  it("lays out again a node put by hand that overlaps, says so, and leaves Undo", async () => {
    const { checks } = make([SHORTER]);
    const layout = read("layout.json");
    const graph = orThrow(parseGraph(read("graph.json")), "graph.json");
    const node = Object.keys(layout.positions)[0] as string;
    const placed = { x: layout.positions[node].x + 2, y: layout.positions[node].y };
    writeFileSync(
      join(dir(), "layout.json"),
      JSON.stringify(
        orThrow(await laidOut(graph, { ...layout, overrides: { [node]: placed } }), "layout"),
      ),
    );
    const report = {
      warnings: [
        {
          check: "overlap",
          scene: "sign_in",
          beat: "start",
          at: 1,
          px: 30,
          nodes: [node],
          message: `node "${node}" and node "x" overlap by 30 px`,
        },
        { check: "loudness", message: "the mix is at -18.2 LUFS; it should be -16 ± 1" },
      ],
    } as unknown as CheckReport;
    await checks.full("oauth", report);
    const messages = await chat();
    const found = messages.flatMap((m) => m.found ?? []).map((f) => f.text);
    expect(found).toEqual(
      expect.arrayContaining([
        `In beat "start", node "${node}" and node "x" overlap by 30 px.`,
        "The mix is at -18.2 LUFS; it should be -16 ± 1.",
        'The line of beat "code" goes by too fast to read.',
      ]),
    );
    const ids = messages.flatMap((m) => m.fixes ?? []).map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(messages.at(-1)).toMatchObject({ kind: "fix", fix: { done: "applied" } });
    expect(messages.at(-1)?.text).toMatch(/^Done: lay out node/);
    expect(read("layout.json").overrides).toEqual({});
  });
});
