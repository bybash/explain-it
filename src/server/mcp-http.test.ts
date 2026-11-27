import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakeTts } from "../audio/fake-tts.testing.ts";
import { createApp } from "./app.ts";
import { settingsStore } from "./settings.ts";

let projectsDir: string;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  projectsDir = mkdtempSync(join(tmpdir(), "explain-it-mcp-http-"));
  app = createApp({
    projectsDir,
    now: () => new Date("2026-11-20T10:00:00.000Z"),
    tts: fakeTts().tts,
    settings: settingsStore({ envFile: join(projectsDir, ".env"), environment: {} }),
  });
});
afterEach(() => rmSync(projectsDir, { recursive: true, force: true }));

/** One JSON-RPC request to /mcp, as an MCP client sends it over Streamable HTTP. */
const rpc = (method: string, params: unknown, headers: Record<string, string> = {}) =>
  app.request("http://127.0.0.1:3000/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });

const INITIALIZE = {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "test", version: "1.0.0" },
};

describe("/mcp", () => {
  it("answers an MCP client over Streamable HTTP", async () => {
    const init = await rpc("initialize", INITIALIZE);
    expect(init.status).toBe(200);
    const body = await init.json();
    expect(body.result.serverInfo.name).toBe("explain-it");

    const listed = await (await rpc("tools/list", {})).json();
    expect(listed.result.tools.map((t: { name: string }) => t.name)).toContain("create_project");

    const prompts = await (await rpc("prompts/list", {})).json();
    expect(prompts.result.prompts.map((p: { name: string }) => p.name)).toEqual([
      "explain_flow",
      "explain_change",
    ]);
    const prompt = await (
      await rpc("prompts/get", { name: "explain_flow", arguments: { topic: "how login works" } })
    ).json();
    expect(prompt.result.messages[0].content.text).toMatch(
      /^Make an explAIn-it video explaining how login works/,
    );
  });

  it("gives tool results with preview links on the address the client used", async () => {
    const created = await (
      await rpc("tools/call", {
        name: "create_project",
        arguments: {
          graph: {
            version: 1,
            title: "Tiny",
            nodes: [{ id: "a", label: "A", kind: "service" }],
            edges: [],
            zones: [],
          },
        },
      })
    ).json();
    const result = JSON.parse(created.result.content[0].text);
    expect(result.preview).toBe("http://127.0.0.1:3000/#/projects/tiny");
  });

  it("refuses requests addressed to another host name or from another site's page", async () => {
    const rebound = await app.request("http://evil.example:3000/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    expect(rebound.status).toBe(403);
    const crossSite = await rpc("tools/list", {}, { origin: "https://evil.example" });
    expect(crossSite.status).toBe(403);
  });

  it("answers GET and DELETE with 405, as a server without sessions has no stream to open", async () => {
    for (const method of ["GET", "DELETE"]) {
      const response = await app.request("http://127.0.0.1:3000/mcp", {
        method,
        headers: { accept: "application/json, text/event-stream" },
      });
      expect(response.status, method).toBe(405);
    }
  });

  it("builds preview links on the public address when the app sits behind a proxy", async () => {
    const proxied = createApp({
      projectsDir,
      now: () => new Date("2026-11-20T10:00:00.000Z"),
      publicUrl: "http://127.0.0.1:3000",
      tts: fakeTts().tts,
      settings: settingsStore({ envFile: join(projectsDir, ".env"), environment: {} }),
    });
    const response = await proxied.request("http://127.0.0.1:3001/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "create_project",
          arguments: {
            graph: {
              version: 1,
              title: "Tiny",
              nodes: [{ id: "a", label: "A", kind: "service" }],
              edges: [],
              zones: [],
            },
          },
        },
      }),
    });
    const body = await response.json();
    expect(JSON.parse(body.result.content[0].text).preview).toBe(
      "http://127.0.0.1:3000/#/projects/tiny",
    );
  });
});
