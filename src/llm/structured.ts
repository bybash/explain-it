import { z } from "zod";
import { formatErrors, parseWith, type Validated, type ValidationError } from "../schema/errors.ts";
import type { LlmMessage } from "../schema/llm.ts";
import { fail, ok } from "../schema/result.ts";
import type { LlmClient } from "./client.ts";

/** How often a call is asked again after its answer did not fit (SPEC, LLM: "at most twice"). */
export const MAX_REPAIRS = 2;

export type StructuredCall<S extends z.ZodType> = {
  /** What the call is for, such as "graph": it names its fixtures. */
  readonly name: string;
  readonly system: string;
  readonly prompt: string;
  /** The shape of the answer: sent as JSON Schema, and checked with its own errors. */
  readonly schema: S;
  /** A check after the schema, such as references between files. */
  readonly check?: (value: z.output<S>) => Validated<z.output<S>>;
};

/** The answer's text, read as the schema and then the check read it. */
const read = <S extends z.ZodType>(
  text: string,
  { schema, check }: StructuredCall<S>,
): Validated<z.output<S>> => {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return fail([{ path: "(answer)", message: "not JSON; answer with the JSON object only" }]);
  }
  const parsed = parseWith(schema, data);
  if (!parsed.ok || !check) return parsed;
  return check(parsed.value);
};

/** The message that sends an answer's problems back, each named by its place. */
const repairPrompt = (errors: readonly ValidationError[]) =>
  [
    "Your answer has these problems:",
    ...formatErrors(errors).map((line) => `- ${line}`),
    "Answer again with the whole JSON object, fixed. Keep everything else as it was.",
  ].join("\n");

/**
 * A JSON Schema as structured output takes it: Claude's refuses `oneOf`,
 * which zod writes for a discriminated union (a beat's actions), so it is
 * sent as `anyOf`. The answer is still checked against the real schema.
 */
export const forStructuredOutput = (schema: unknown): unknown => {
  if (Array.isArray(schema)) return schema.map(forStructuredOutput);
  if (schema === null || typeof schema !== "object") return schema;
  return Object.fromEntries(
    Object.entries(schema).map(([key, value]) => [
      key === "oneOf" ? "anyOf" : key,
      forStructuredOutput(value),
    ]),
  );
};

/** What a structured call came to: the answer, or the last answer that fitted and what it could still improve. */
type Outcome<T> =
  | { readonly kind: "done"; readonly value: T; readonly remaining: readonly ValidationError[] }
  | { readonly kind: "failed"; readonly errors: readonly ValidationError[] };

/**
 * The loop under both calls: an answer that does not fit, or (with
 * `improve`) could be better, goes back with its problems, each named by its
 * place, at most `MAX_REPAIRS` times. An answer that fits but could still be
 * better is kept, so the one with the fewest problems left is the outcome
 * when the repairs run out.
 */
const repairing = async <S extends z.ZodType>(
  client: LlmClient,
  call: StructuredCall<S>,
  improve: (value: z.output<S>) => readonly ValidationError[] = () => [],
): Promise<Outcome<z.output<S>>> => {
  const schema = forStructuredOutput(z.toJSONSchema(call.schema, { io: "output" })) as Record<
    string,
    unknown
  >;
  const messages: LlmMessage[] = [{ role: "user", content: call.prompt }];
  let problems: readonly ValidationError[] = [];
  let kept: { value: z.output<S>; remaining: readonly ValidationError[] } | undefined;
  for (let attempt = 0; attempt <= MAX_REPAIRS; attempt++) {
    const reply = await client.generate({
      name: call.name,
      system: call.system,
      messages: [...messages],
      schema,
    });
    if (!reply.ok) return { kind: "failed", errors: reply.errors };
    const answer = read(reply.value.text, call);
    problems = answer.ok ? improve(answer.value) : answer.errors;
    // The answer with the fewest problems left is kept: a repair can make things worse.
    if (answer.ok && (!kept || problems.length <= kept.remaining.length))
      kept = { value: answer.value, remaining: problems };
    if (problems.length === 0 && kept) return { kind: "done", ...kept };
    messages.push(
      { role: "assistant", content: reply.value.text },
      { role: "user", content: repairPrompt(problems) },
    );
  }
  if (kept) return { kind: "done", ...kept };
  return {
    kind: "failed",
    errors: [
      { path: "llm", message: `the answer still did not fit after ${MAX_REPAIRS} repairs` },
      ...problems,
    ],
  };
};

/**
 * One structured call with its repair loop (SPEC, LLM): the model is asked
 * for JSON in the schema's shape; an answer that is not JSON, does not fit
 * the schema or fails the check is sent back with its problems, each named
 * by its place, at most `MAX_REPAIRS` times. A failed call stops the loop
 * with its reason; an answer that still does not fit gives the last
 * problems, as the LLM giving up is an expected failure (AGENTS.md).
 */
export const structuredCall = async <S extends z.ZodType>(
  client: LlmClient,
  call: StructuredCall<S>,
): Promise<Validated<z.output<S>>> => {
  const outcome = await repairing(client, call);
  return outcome.kind === "done" ? ok(outcome.value) : fail(outcome.errors);
};

/**
 * A draft (5.4): a structured call whose answer is also sent back for what
 * `improve` finds (the checks), within the same repairs. When they run out,
 * the answer that fits with the fewest problems is kept, with what is left, so a
 * good draft is not lost over a beat a second too long.
 */
export const structuredDraft = async <S extends z.ZodType>(
  client: LlmClient,
  call: StructuredCall<S> & {
    readonly improve: (value: z.output<S>) => readonly ValidationError[];
  },
): Promise<Validated<{ value: z.output<S>; remaining: readonly ValidationError[] }>> => {
  const outcome = await repairing(client, call, call.improve);
  return outcome.kind === "done"
    ? ok({ value: outcome.value, remaining: outcome.remaining })
    : fail(outcome.errors);
};
