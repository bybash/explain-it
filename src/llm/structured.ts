import { z } from "zod";
import { formatErrors, parseWith, type Validated, type ValidationError } from "../schema/errors.ts";
import { fail } from "../schema/result.ts";
import type { LlmClient, LlmMessage } from "./client.ts";

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
  const schema = z.toJSONSchema(call.schema, { io: "output" }) as Record<string, unknown>;
  const messages: LlmMessage[] = [{ role: "user", content: call.prompt }];
  let problems: readonly ValidationError[] = [];
  for (let attempt = 0; attempt <= MAX_REPAIRS; attempt++) {
    const reply = await client.generate({
      name: call.name,
      system: call.system,
      messages: [...messages],
      schema,
    });
    if (!reply.ok) return reply;
    const answer = read(reply.value.text, call);
    if (answer.ok) return answer;
    problems = answer.errors;
    messages.push(
      { role: "assistant", content: reply.value.text },
      { role: "user", content: repairPrompt(problems) },
    );
  }
  return fail([
    { path: "llm", message: `the answer still did not fit after ${MAX_REPAIRS} repairs` },
    ...problems,
  ]);
};
