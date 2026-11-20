import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MCP_PATH, PROMPT_NAMES, TOOL_NAMES } from "../schema/mcp.ts";
import { DEFAULT_HOST, DEFAULT_PORT } from "../server/listen.ts";

/** Where an IDE finds the MCP endpoint of an app started with the defaults. */
const URL = `http://${DEFAULT_HOST}:${DEFAULT_PORT}${MCP_PATH}`;
const read = (path: string) =>
  readFileSync(new globalThis.URL(`../../${path}`, import.meta.url), "utf8");
const readme = read("README.md");
const jsonBlocks = [...readme.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => m[1] ?? "");

describe("the IDE setup the README and the repository's configs give", () => {
  it("connects Claude Code and VS Code through .mcp.json", () => {
    expect(JSON.parse(read(".mcp.json"))).toEqual({
      mcpServers: { "explain-it": { type: "http", url: URL } },
    });
  });

  it("connects Cursor through .cursor/mcp.json", () => {
    expect(JSON.parse(read(".cursor/mcp.json"))).toEqual({
      mcpServers: { "explain-it": { url: URL } },
    });
  });

  it("gives the Claude Code command with the default address", () => {
    expect(readme).toContain(`claude mcp add --transport http explain-it ${URL}`);
  });

  it("shows each config in the README as it is checked in", () => {
    const shown = jsonBlocks.map((block) => JSON.parse(block));
    expect(shown).toContainEqual(JSON.parse(read(".mcp.json")));
    expect(shown).toContainEqual(JSON.parse(read(".cursor/mcp.json")));
  });

  it("names only tools and prompts the server has", () => {
    const known: readonly string[] = [
      ...Object.values(TOOL_NAMES),
      ...Object.values(PROMPT_NAMES),
    ] as string[];
    const named = [...readme.matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)].map((m) => m[1]);
    expect(named.length).toBeGreaterThan(0);
    expect(named.filter((name) => !known.includes(name ?? ""))).toEqual([]);
  });
});
