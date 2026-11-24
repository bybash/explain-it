import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { z } from "zod";
import { inFile } from "../render/load.ts";
import { writeWhole } from "../render/write-whole.ts";
import { parseWith, type Validated } from "../schema/errors.ts";
import {
  LlmFixtureSchema,
  type LlmReply,
  LlmTurnFixtureSchema,
  type LlmTurnReply,
} from "../schema/llm.ts";
import { fail, ok } from "../schema/result.ts";
import type { LlmClient } from "./client.ts";

/** Where the recorded answers live; tests replay them, so CI needs no key (AGENTS.md, Tests). */
export const FIXTURES_DIR = fileURLToPath(new URL("./fixtures/", import.meta.url));

/**
 * A request's key: a hash of everything the model is asked, but not the
 * model. A changed prompt, conversation, schema or tool has another key, so
 * it is never answered with an old recording: replaying it fails and asks
 * for a new one.
 */
const keyOf = (asked: unknown) =>
  createHash("sha256").update(JSON.stringify(asked)).digest("hex").slice(0, 16);

/** A recorded file read through its schema: its reply, or why it cannot be used. */
const readRecorded = async <S extends z.ZodType<{ reply: unknown }>>(
  path: string,
  file: string,
  schema: S,
): Promise<Validated<z.output<S>["reply"]> | undefined> => {
  // Only a missing file means "not recorded"; any other failure is a broken environment.
  const text = await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  });
  if (text === undefined) return undefined;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return fail([{ path: file, message: "not valid JSON" }]);
  }
  const fixture = parseWith(schema, data);
  return fixture.ok ? ok(fixture.value.reply) : fail(inFile(file, fixture.errors));
};

/**
 * An LLM client that answers from recorded fixtures (`<name>-<key>.json`),
 * for structured calls and for an agent's steps alike. With `record`, a
 * request not recorded yet goes to that client, and its answer is saved; a
 * failed call is not. Without it, a missing recording is an error that says
 * how to make one.
 */
export const fixtureClient = ({
  dir,
  record,
}: {
  readonly dir: string;
  readonly record?: LlmClient;
}): LlmClient => {
  /** Replays the recording for `asked`, or records it with `call` when recording. */
  const replay = async <R>(
    name: string,
    asked: Record<string, unknown>,
    field: "request" | "turn",
    schema: z.ZodType<{ reply: R }>,
    call: (recorder: LlmClient) => Promise<Validated<R>>,
  ): Promise<Validated<R>> => {
    const key = keyOf(field === "request" ? [asked.system, asked.messages, asked.schema] : asked);
    const file = `${name}-${key}.json`;
    const path = join(dir, file);
    const recorded = await readRecorded(path, file, schema);
    if (recorded) return recorded as Validated<R>;
    if (!record)
      return fail([
        {
          path: "llm",
          message: `no recorded answer for "${name}" (${key}); record it with npm run llm:record`,
        },
      ]);
    const reply = await call(record);
    if (!reply.ok) return reply;
    await mkdir(dir, { recursive: true });
    await writeWhole(
      path,
      `${JSON.stringify({ name, [field]: asked, reply: reply.value }, null, 2)}\n`,
    );
    return reply;
  };

  return {
    generate: ({ name, ...asked }) =>
      replay<LlmReply>(name, asked, "request", LlmFixtureSchema, (r) =>
        r.generate({ name, ...asked }),
      ),
    converse: ({ name, ...asked }) =>
      replay<LlmTurnReply>(name, asked, "turn", LlmTurnFixtureSchema, (r) =>
        r.converse({ name, ...asked }),
      ),
  };
};
