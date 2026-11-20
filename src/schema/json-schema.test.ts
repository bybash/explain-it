import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { jsonSchemaFiles } from "./json-schema.ts";

const schemasDir = new URL("../../schemas/", import.meta.url);
const STALE = "schemas/ is out of date: run `npm run schemas` and commit the result";

describe("generated JSON Schemas", () => {
  const generated = jsonSchemaFiles();

  it("cover graph, storyboard, config, project and layout", () => {
    expect(Object.keys(generated).toSorted()).toEqual([
      "config.schema.json",
      "graph.schema.json",
      "layout.schema.json",
      "project.schema.json",
      "storyboard.schema.json",
    ]);
  });

  it("match the committed files", () => {
    const committed = readdirSync(schemasDir).filter((file) => file.endsWith(".json"));
    expect(committed.toSorted(), STALE).toEqual(Object.keys(generated).toSorted());
    for (const [file, content] of Object.entries(generated)) {
      expect(readFileSync(new URL(file, schemasDir), "utf8"), `${file}: ${STALE}`).toBe(content);
    }
  });

  it("let config fields be left out, since they have defaults", () => {
    const config = JSON.parse(generated["config.schema.json"] ?? "{}");
    expect(config.required ?? []).toEqual([]);
  });

  it("keeps the logo's need for a light or a dark file", () => {
    const config = JSON.parse(jsonSchemaFiles()["config.schema.json"] ?? "{}");
    expect(config.properties.logo.anyOf).toEqual([{ required: ["light"] }, { required: ["dark"] }]);
  });
});
