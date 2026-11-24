import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { inFile } from "../render/load.ts";
import { writeWhole } from "../render/write-whole.ts";
import { parseWith, type Validated } from "../schema/errors.ts";
import { LlmFixtureSchema, type LlmReply } from "../schema/llm.ts";
import { fail, ok } from "../schema/result.ts";
import type { LlmClient, LlmRequest } from "./client.ts";

/** Where the recorded answers live; tests replay them, so CI needs no key (AGENTS.md, Tests). */
export const FIXTURES_DIR = fileURLToPath(new URL("./fixtures/", import.meta.url));

/**
 * A request's key: a hash of everything the model is asked, but not the
 * model. A changed prompt or schema has another key, so it is never answered
 * with an old recording: replaying it fails and asks for a new one.
 */
const keyOf = ({ system, messages, schema }: LlmRequest) =>
  createHash("sha256")
    .update(JSON.stringify([system, messages, schema]))
    .digest("hex")
    .slice(0, 16);

/**
 * An LLM client that answers from recorded fixtures (`<name>-<key>.json`).
 * With `record`, a request not recorded yet goes to that client, and its
 * answer is saved; a failed call is not. Without it, a missing recording is
 * an error that says how to make one.
 */
export const fixtureClient = ({
  dir,
  record,
}: {
  readonly dir: string;
  readonly record?: LlmClient;
}): LlmClient => ({
  generate: async (request): Promise<Validated<LlmReply>> => {
    const key = keyOf(request);
    const file = `${request.name}-${key}.json`;
    const path = join(dir, file);
    // Only a missing file means "not recorded"; any other failure is a broken environment.
    const text = await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (text !== undefined) {
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        return fail([{ path: file, message: "not valid JSON" }]);
      }
      const fixture = parseWith(LlmFixtureSchema, data);
      return fixture.ok ? ok(fixture.value.reply) : fail(inFile(file, fixture.errors));
    }
    if (!record)
      return fail([
        {
          path: "llm",
          message: `no recorded answer for "${request.name}" (${key}); record it with npm run llm:record`,
        },
      ]);
    const reply = await record.generate(request);
    if (!reply.ok) return reply;
    const { name, ...asked } = request;
    await mkdir(dir, { recursive: true });
    await writeWhole(
      path,
      `${JSON.stringify({ name, request: asked, reply: reply.value }, null, 2)}\n`,
    );
    return reply;
  },
});
