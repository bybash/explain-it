import { describe, expect, it } from "vitest";
import { formatErrors } from "./errors.ts";
import { parseProject } from "./project.ts";

const validProject = () => ({
  version: 1,
  name: "OAuth login",
  gate: "graph",
  staleBeats: [],
  origin: "web",
  createdAt: "2026-11-19T10:00:00.000Z",
  updatedAt: "2026-11-19T10:00:00.000Z",
});

const errorsFor = (data: unknown) => {
  const result = parseProject(data);
  if (result.ok) throw new Error("expected errors");
  return formatErrors(result.errors);
};

describe("parseProject", () => {
  it("accepts a valid project", () => {
    expect(parseProject(validProject()).ok).toBe(true);
  });

  it("accepts sources from MCP", () => {
    const project = {
      ...validProject(),
      origin: "mcp",
      sources: [{ path: "src/auth/login.ts", commit: "93c42a0" }, { path: "docs/auth.md" }],
    };
    expect(parseProject(project).ok).toBe(true);
  });

  it("lists the gates", () => {
    expect(errorsFor({ ...validProject(), gate: "done" })).toEqual([
      'gate: must be one of "graph", "script", "style", "preview", "render"',
    ]);
  });

  it("requires ISO timestamps", () => {
    expect(errorsFor({ ...validProject(), createdAt: "yesterday" })).toEqual([
      "createdAt: must be an ISO date-time",
    ]);
  });
});
