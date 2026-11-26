import { describe, expect, it } from "vitest";
import { z } from "zod";
import { formatErrors } from "../schema/errors.ts";
import { fail, ok } from "../schema/result.ts";
import { fakeLlm } from "./fake-llm.testing.ts";
import {
  forStructuredOutput,
  MAX_REPAIRS,
  type StructuredCall,
  structuredCall,
  structuredDraft,
} from "./structured.ts";

const Greeting = z.strictObject({ greeting: z.string().min(1).max(20), to: z.string() });
const call = (
  replies: Parameters<typeof fakeLlm>[0],
  check?: StructuredCall<typeof Greeting>["check"],
) => {
  const { client, asked } = fakeLlm(replies);
  const result = structuredCall(client, {
    name: "greeting",
    system: "You greet people.",
    prompt: "Greet Ada.",
    schema: Greeting,
    ...(check ? { check } : {}),
  });
  return { result, asked };
};

describe("structuredCall", () => {
  it("gives the answer once it fits the schema, asking with the schema as JSON Schema", async () => {
    const { result, asked } = call(['{"greeting":"Hello","to":"Ada"}']);
    expect(await result).toEqual(ok({ greeting: "Hello", to: "Ada" }));
    expect(asked).toHaveLength(1);
    expect(asked[0]?.messages).toEqual([{ role: "user", content: "Greet Ada." }]);
    expect(asked[0]?.schema).toMatchObject({ type: "object", required: ["greeting", "to"] });
  });

  it("sends the problems back, each named by its place, and takes the repaired answer", async () => {
    const { result, asked } = call([
      '{"greeting":"","to":"Ada"}',
      '{"greeting":"Hello","to":"Ada"}',
    ]);
    expect(await result).toEqual(ok({ greeting: "Hello", to: "Ada" }));
    const repair = asked[1]?.messages ?? [];
    expect(repair.slice(0, 2)).toEqual([
      { role: "user", content: "Greet Ada." },
      { role: "assistant", content: '{"greeting":"","to":"Ada"}' },
    ]);
    expect(repair[2]?.content).toMatch(/greeting: must not be empty/);
  });

  it("answers text that is not JSON as a problem too", async () => {
    const { result, asked } = call(["Hello Ada!", '{"greeting":"Hi","to":"Ada"}']);
    expect((await result).ok).toBe(true);
    expect(asked[1]?.messages[2]?.content).toMatch(/not JSON/);
  });

  it("runs the caller's own check after the schema, such as references between files", async () => {
    const onlyAda = (value: z.output<typeof Greeting>) =>
      value.to === "Ada"
        ? ok(value)
        : fail([{ path: "to", message: `unknown person "${value.to}"` }]);
    const { result, asked } = call(
      ['{"greeting":"Hello","to":"Bob"}', '{"greeting":"Hello","to":"Ada"}'],
      onlyAda,
    );
    expect(await result).toEqual(ok({ greeting: "Hello", to: "Ada" }));
    expect(asked[1]?.messages[2]?.content).toContain('to: unknown person "Bob"');
  });

  it(`gives up after ${MAX_REPAIRS} repairs, with the last problems`, async () => {
    const { result, asked } = call(Array.from({ length: MAX_REPAIRS + 1 }, () => '{"to":"Ada"}'));
    const answer = await result;
    expect(asked).toHaveLength(MAX_REPAIRS + 1);
    expect(answer.ok ? [] : formatErrors(answer.errors)).toEqual([
      `llm: the answer still did not fit after ${MAX_REPAIRS} repairs`,
      "greeting: required",
    ]);
  });

  it("stops at a failed call, with its reason", async () => {
    const { result } = call([
      { error: "the key was refused by openrouter.ai; check it in Settings" },
    ]);
    const answer = await result;
    expect(answer.ok ? [] : formatErrors(answer.errors)).toEqual([
      "llm: the key was refused by openrouter.ai; check it in Settings",
    ]);
  });
});

describe("structuredDraft", () => {
  const short = (value: z.output<typeof Greeting>) =>
    value.greeting.length <= 3 ? [] : [{ path: "greeting", message: "too long; 3 at most" }];

  it("sends an answer back for what could be better, and takes it once it is", async () => {
    const { client, asked } = fakeLlm([
      '{"greeting":"Hello","to":"Ada"}',
      '{"greeting":"Hi","to":"Ada"}',
    ]);
    const drafted = await structuredDraft(client, {
      name: "greeting",
      system: "",
      prompt: "Greet Ada.",
      schema: Greeting,
      improve: short,
    });
    expect(drafted).toEqual(ok({ value: { greeting: "Hi", to: "Ada" }, remaining: [] }));
    expect(asked[1]?.messages.at(-1)?.content).toContain("greeting: too long");
  });

  it("keeps the last answer that fits, with what is left to improve, rather than none", async () => {
    const { client } = fakeLlm(
      Array.from({ length: MAX_REPAIRS + 1 }, () => '{"greeting":"Hello","to":"Ada"}'),
    );
    const drafted = await structuredDraft(client, {
      name: "greeting",
      system: "",
      prompt: "Greet Ada.",
      schema: Greeting,
      improve: short,
    });
    expect(drafted).toEqual(
      ok({
        value: { greeting: "Hello", to: "Ada" },
        remaining: [{ path: "greeting", message: "too long; 3 at most" }],
      }),
    );
  });
});

describe("forStructuredOutput", () => {
  it("sends a discriminated union as anyOf, which every structured output takes", () => {
    const Action = z.discriminatedUnion("type", [
      z.strictObject({ type: z.literal("a"), x: z.number() }),
      z.strictObject({ type: z.literal("b") }),
    ]);
    const sent = JSON.stringify(
      forStructuredOutput(z.toJSONSchema(z.strictObject({ actions: z.array(Action) }))),
    );
    expect(sent).not.toContain("oneOf");
    expect(sent).toContain("anyOf");
  });
});
