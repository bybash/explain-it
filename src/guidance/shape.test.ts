import { describe, expect, it } from "vitest";
import { z } from "zod";
import { schemaShape } from "./shape.ts";

describe("schemaShape", () => {
  it("writes a schema as TypeScript-like types, with its limits, defaults and descriptions", () => {
    const Doc = z.strictObject({
      version: z.literal(1),
      title: z.string().min(1).max(10).describe("The name."),
      tags: z
        .array(
          z.strictObject({ id: z.string().regex(/^[a-z]+$/), kind: z.enum(["a", "b"]).optional() }),
        )
        .min(1)
        .max(3),
      mode: z.enum(["x", "y"]).default("x"),
      size: z.number().min(0.5).max(2).optional(),
      shown: z.boolean(),
      look: z.union([z.string(), z.strictObject({ colour: z.string() })]).optional(),
      parts: z
        .array(
          z.discriminatedUnion("type", [
            z.strictObject({ type: z.literal("one"), at: z.number() }).describe("The first."),
            z.strictObject({ type: z.literal("two") }),
          ]),
        )
        .max(5),
    });
    expect(schemaShape("Doc", Doc, { tags: "Tag", parts: "Part" }).split("\n")).toEqual([
      "type Doc = {",
      "  version: 1;",
      "  title: string;   // The name. ≤ 10 characters",
      "  tags: Tag[];   // 1–3 items",
      '  mode?: "x" | "y";   // default "x"',
      "  size?: number;   // from 0.5 to 2",
      "  shown: boolean;",
      "  look?: string | Look;",
      "  parts: Part[];   // ≤ 5 items",
      "};",
      "type Tag = {",
      "  id: string;   // matches ^[a-z]+$",
      '  kind?: "a" | "b";',
      "};",
      "type Look = {",
      "  colour: string;",
      "};",
      "type Part = OnePart | TwoPart;",
      "// The first.",
      "type OnePart = {",
      '  type: "one";',
      "  at: number;",
      "};",
      "type TwoPart = {",
      '  type: "two";',
      "};",
    ]);
  });

  it("states a rule that one of several fields must be there", () => {
    const Logo = z
      .strictObject({ light: z.string().optional(), dark: z.string().optional() })
      .meta({ anyOf: [{ required: ["light"] }, { required: ["dark"] }] });
    expect(schemaShape("Logo", Logo).split("\n")).toEqual([
      "// needs at least one of: light, dark",
      "type Logo = {",
      "  light?: string;",
      "  dark?: string;",
      "};",
    ]);
  });
});
