import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ChatMessage } from "../schema/chat.ts";
import { appendChat, readChat } from "./chat.ts";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "explain-it-chat-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const message = (text: string): ChatMessage => ({
  role: "user",
  text,
  at: "2026-11-23T01:00:00.000Z",
  gate: "graph",
});

describe("appendChat", () => {
  it("adds to the end, one message a line", async () => {
    await appendChat(dir, [message("one")]);
    await appendChat(dir, [message("two"), message("three")]);
    expect((await readChat(dir)).messages.map((m) => m.text)).toEqual(["one", "two", "three"]);
  });

  it("starts a new line after a last line a crash left unfinished", async () => {
    writeFileSync(join(dir, "chat.jsonl"), `${JSON.stringify(message("kept"))}\n{"role":"us`);
    await appendChat(dir, [message("after")]);
    const chat = await readChat(dir);
    expect(chat.messages.map((m) => m.text)).toEqual(["kept", "after"]);
    expect(chat.problems).toEqual([{ path: "chat.jsonl line 2", message: "not valid JSON" }]);
    expect(readFileSync(join(dir, "chat.jsonl"), "utf8").endsWith("\n")).toBe(true);
  });
});
