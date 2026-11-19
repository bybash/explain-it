import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseConfig } from "./config.ts";
import { formatErrors } from "./errors.ts";
import { parseGraph } from "./graph.ts";
import { parseProject } from "./project.ts";
import { parseStoryboard } from "./storyboard.ts";

const example = (file: string): Record<string, unknown> =>
  JSON.parse(readFileSync(new URL(`../../examples/oauth-login/${file}`, import.meta.url), "utf8"));

const graphResult = parseGraph(example("graph.json"));
if (!graphResult.ok) throw new Error("example graph is invalid");
const graph = graphResult.value;

const parsers = {
  "graph.json": parseGraph,
  "storyboard.json": (data: unknown) => parseStoryboard(data, graph),
  "config.json": parseConfig,
  "project.json": parseProject,
};

describe.each(Object.entries(parsers))("%s", (file, parse) => {
  it("accepts a $schema key, for editor completion", () => {
    const result = parse({ ...example(file), $schema: "../../schemas/x.schema.json" });
    expect(result.ok ? [] : formatErrors(result.errors)).toEqual([]);
  });

  it("still rejects other unknown keys", () => {
    const result = parse({ ...example(file), $schemas: "typo" });
    expect(result.ok ? [] : formatErrors(result.errors)).toEqual(["$schemas: unknown key"]);
  });
});
