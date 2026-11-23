import { describe, expect, it } from "vitest";
import { MAX_CHAT_MESSAGE, NewChatMessageSchema, parseChatLines } from "./chat.ts";

describe("NewChatMessageSchema", () => {
  it("takes trimmed text up to its limit", () => {
    expect(NewChatMessageSchema.parse({ text: "  hello ", gate: "graph" })).toEqual({
      text: "hello",
      gate: "graph",
    });
    expect(NewChatMessageSchema.safeParse({ text: "   ", gate: "graph" }).success).toBe(false);
    expect(
      NewChatMessageSchema.safeParse({ text: "x".repeat(MAX_CHAT_MESSAGE + 1), gate: "graph" })
        .success,
    ).toBe(false);
  });
});

describe("parseChatLines", () => {
  const message = (text: string) =>
    JSON.stringify({ role: "user", text, at: "2026-11-23T01:00:00.000Z", gate: "graph" });

  it("reads one message a line and names each broken line by number", () => {
    const text = [
      message("first"),
      "{not json",
      "",
      JSON.stringify({ role: "x" }),
      message("last"),
    ].join("\n");
    const { messages, problems } = parseChatLines(text);
    expect(messages.map((m) => m.text)).toEqual(["first", "last"]);
    expect(problems[0]).toEqual({ path: "chat.jsonl line 2", message: "not valid JSON" });
    expect([...new Set(problems.map((p) => p.path.split(":")[0]))]).toEqual([
      "chat.jsonl line 2",
      "chat.jsonl line 4",
    ]);
    expect(problems).toContainEqual({
      path: "chat.jsonl line 4: role",
      message: 'must be one of "user", "assistant"',
    });
  });

  it("reads an empty or missing file as no messages", () => {
    expect(parseChatLines("")).toEqual({ messages: [], problems: [] });
  });
});
