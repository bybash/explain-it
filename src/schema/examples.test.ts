import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseConfig } from "./config.ts";
import { formatErrors } from "./errors.ts";
import { parseGraph } from "./graph.ts";
import { parseLayout } from "./layout.ts";
import { parseProject } from "./project.ts";
import { parseStoryboard } from "./storyboard.ts";

const examplesDir = new URL("../../examples/", import.meta.url);
const examples = readdirSync(examplesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

const readJson = (example: string, file: string): unknown =>
  JSON.parse(readFileSync(new URL(`${example}/${file}`, examplesDir), "utf8"));

describe("examples", () => {
  it("include oauth-login", () => {
    expect(examples).toContain("oauth-login");
  });

  describe.each(examples)("%s", (example) => {
    it("has a valid project, graph, storyboard, config and layout", () => {
      const project = parseProject(readJson(example, "project.json"));
      const graph = parseGraph(readJson(example, "graph.json"));
      const config = parseConfig(readJson(example, "config.json"));
      expect(project.ok ? [] : formatErrors(project.errors)).toEqual([]);
      expect(config.ok ? [] : formatErrors(config.errors)).toEqual([]);
      if (!graph.ok) throw new Error(formatErrors(graph.errors).join("\n"));

      const storyboard = parseStoryboard(readJson(example, "storyboard.json"), graph.value);
      expect(storyboard.ok ? [] : formatErrors(storyboard.errors)).toEqual([]);

      const layout = parseLayout(readJson(example, "layout.json"), graph.value);
      expect(layout.ok ? [] : formatErrors(layout.errors)).toEqual([]);
    });
  });
});
