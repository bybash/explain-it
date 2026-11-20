import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MCP_PATH, PROMPT_NAMES, TOOL_NAMES } from "../schema/mcp.ts";
import { DEFAULT_HOST, DEFAULT_PORT } from "./listen.ts";

/** Where an IDE finds the MCP endpoint of an app started with the defaults. */
const APP_ADDRESS = `${DEFAULT_HOST}:${DEFAULT_PORT}`;
const MCP_URL = `http://${APP_ADDRESS}${MCP_PATH}`;
const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const readme = read("README.md");
const jsonBlocks = [...readme.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => m[1] ?? "");
/** The walkthrough section, up to the next heading. */
const walkthrough = readme.split(/^## Walkthrough.*$/m)[1]?.split(/^## /m)[0] ?? "";

describe("the IDE setup the README and the repository's configs give", () => {
  it("connects Claude Code and VS Code through .mcp.json", () => {
    expect(JSON.parse(read(".mcp.json"))).toEqual({
      mcpServers: { "explain-it": { type: "http", url: MCP_URL } },
    });
  });

  it("connects Cursor through .cursor/mcp.json", () => {
    expect(JSON.parse(read(".cursor/mcp.json"))).toEqual({
      mcpServers: { "explain-it": { url: MCP_URL } },
    });
  });

  it("gives the Claude Code command, and only the default address", () => {
    expect(readme).toContain(`claude mcp add --transport http explain-it ${MCP_URL}`);
    const addresses = [...readme.matchAll(/127\.0\.0\.1:\d+/g)].map((m) => m[0]);
    expect(addresses.length).toBeGreaterThan(0);
    expect(new Set(addresses)).toEqual(new Set([APP_ADDRESS]));
  });

  it("shows each config in the README as it is checked in", () => {
    const shown = jsonBlocks.map((block) => JSON.parse(block));
    expect(shown).toContainEqual(JSON.parse(read(".mcp.json")));
    expect(shown).toContainEqual(JSON.parse(read(".cursor/mcp.json")));
  });

  it("walks through the tools an agent makes a video with, by their names", () => {
    const steps = [
      TOOL_NAMES.getGuide,
      TOOL_NAMES.createProject,
      TOOL_NAMES.setStoryboard,
      TOOL_NAMES.setStyle,
      TOOL_NAMES.check,
      TOOL_NAMES.render,
      TOOL_NAMES.renderStatus,
      TOOL_NAMES.cancelRender,
    ];
    for (const tool of steps) expect(walkthrough).toContain(`\`${tool}\``);
    expect(walkthrough).toContain(`\`/mcp__explain-it__${PROMPT_NAMES.explainFlow}\``);
    const known = new Set<string>([...Object.values(TOOL_NAMES), ...Object.values(PROMPT_NAMES)]);
    const snakeCase = [...walkthrough.matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)].map((m) => m[1] ?? "");
    expect(snakeCase.filter((name) => !known.has(name))).toEqual([]);
  });
});
