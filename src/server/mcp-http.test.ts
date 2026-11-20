import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";

let projectsDir: string;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  projectsDir = mkdtempSync(join(tmpdir(), "explain-it-mcp-http-"));
  app = createApp({ projectsDir, now: () => new Date("2026-11-20T10:00:00.000Z") });
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
});
