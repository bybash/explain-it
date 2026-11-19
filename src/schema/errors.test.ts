import { describe, expect, it } from "vitest";
import { z } from "zod";
import { formatErrors, formatPath, parseWith } from "./errors.ts";

describe("formatPath", () => {
  it("joins keys with dots and indexes with brackets", () => {
    expect(formatPath(["scenes", 1, "beats", 3, "caption"])).toBe("scenes[1].beats[3].caption");
  });

  it("names the root", () => {
    expect(formatPath([])).toBe("(root)");
  });

  it("starts with an index when the root is an array", () => {
    expect(formatPath([0, "id"])).toBe("[0].id");
  });

  it("quotes keys that are not plain identifiers", () => {
    expect(formatPath([""])).toBe('[""]');
    expect(formatPath(["nodes", "my key"])).toBe('nodes["my key"]');
  });
});

describe("parseWith", () => {
  const schema = z.strictObject({
    name: z.string().min(1).max(5),
    tags: z.array(z.string()).max(2),
    count: z.number().int().min(0).max(10),
    kind: z.enum(["a", "b"]),
    version: z.literal(1),
    id: z.string().regex(/^[a-z]+$/, { error: "must use only a-z" }),
  });
  const valid = { name: "ok", tags: [], count: 1, kind: "a", version: 1, id: "abc" };

  const errorsFor = (patch: Record<string, unknown>) => {
    const result = parseWith(schema, { ...valid, ...patch });
    if (result.ok) throw new Error("expected errors");
    return formatErrors(result.errors);
  };

  it("returns the parsed value", () => {
    expect(parseWith(schema, valid)).toEqual({ ok: true, value: valid });
  });

  it("reports string length", () => {
    expect(errorsFor({ name: "toolong" })).toEqual(["name: 7 characters, max 5"]);
    expect(errorsFor({ name: "" })).toEqual(["name: must not be empty"]);
  });

  it("reports array length", () => {
    expect(errorsFor({ tags: ["a", "b", "c"] })).toEqual(["tags: 3 items, max 2"]);
  });

  it("reports number bounds", () => {
    expect(errorsFor({ count: 11 })).toEqual(["count: must be at most 10"]);
    expect(errorsFor({ count: -1 })).toEqual(["count: must be at least 0"]);
  });

  it("reports wrong and missing types", () => {
    expect(errorsFor({ count: "1" })).toEqual(["count: expected number, got string"]);
    expect(errorsFor({ name: undefined })).toEqual(["name: required"]);
  });

  it("lists allowed values", () => {
    expect(errorsFor({ kind: "c" })).toEqual(['kind: must be one of "a", "b"']);
    expect(errorsFor({ version: 2 })).toEqual(["version: must be 1"]);
  });

  it("uses the schema's own message for patterns", () => {
    expect(errorsFor({ id: "ABC" })).toEqual(["id: must use only a-z"]);
  });

  it("reports each unknown key at its own path", () => {
    expect(errorsFor({ colour: "red" })).toEqual(["colour: unknown key"]);
  });

  it("never throws, whatever the input", () => {
    for (const input of [null, undefined, 42, "x", [], [1], { name: 1 }]) {
      expect(parseWith(schema, input).ok).toBe(false);
    }
  });
});
