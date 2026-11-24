import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatErrors } from "../schema/errors.ts";
import type { LlmRequest } from "./client.ts";
import { fakeLlm } from "./fake-llm.testing.ts";
import { fixtureClient } from "./fixtures.ts";

const REQUEST: LlmRequest = {
  name: "greeting",
  system: "You greet people.",
  messages: [{ role: "user", content: "Greet Ada." }],
  schema: { type: "object" },
};

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "explain-it-fixtures-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const lines = (result: Awaited<ReturnType<ReturnType<typeof fixtureClient>["generate"]>>) =>
  result.ok ? [] : formatErrors(result.errors);

describe("fixtureClient", () => {
  it("records a real answer once, then replays it without the real client", async () => {
    const real = fakeLlm(['{"greeting":"Hello"}']);
    expect(await fixtureClient({ dir, record: real.client }).generate(REQUEST)).toEqual({
      ok: true,
      value: { text: '{"greeting":"Hello"}' },
    });
    const files = readdirSync(dir);
    expect(files).toEqual([expect.stringMatching(/^greeting-[0-9a-f]{16}\.json$/)]);
    const saved = JSON.parse(readFileSync(join(dir, files[0] ?? ""), "utf8"));
    expect(saved).toMatchObject({ name: "greeting", request: { system: "You greet people." } });

    expect(await fixtureClient({ dir }).generate(REQUEST)).toEqual({
      ok: true,
      value: { text: '{"greeting":"Hello"}' },
    });
    expect(real.asked).toHaveLength(1);
  });

  it("finds no answer for a request that changed, and says how to record one", async () => {
    await fixtureClient({ dir, record: fakeLlm(["{}"]).client }).generate(REQUEST);
    const changed = { ...REQUEST, system: "You greet people warmly." };
    expect(lines(await fixtureClient({ dir }).generate(changed))).toEqual([
      expect.stringMatching(
        /^llm: no recorded answer for "greeting" \([0-9a-f]{16}\); record it with npm run llm:record$/,
      ),
    ]);
  });

  it("records no failed call", async () => {
    const real = fakeLlm([{ error: "the key was refused by openrouter.ai" }]);
    const result = await fixtureClient({ dir, record: real.client }).generate(REQUEST);
    expect(lines(result)).toEqual(["llm: the key was refused by openrouter.ai"]);
    expect(readdirSync(dir)).toEqual([]);
  });

  it("names a broken fixture file", async () => {
    await fixtureClient({ dir, record: fakeLlm(["{}"]).client }).generate(REQUEST);
    const [file = ""] = readdirSync(dir);
    writeFileSync(join(dir, file), '{"name": 3}');
    expect(lines(await fixtureClient({ dir }).generate(REQUEST))[0]).toMatch(
      new RegExp(`^${file.replace(".", "\\.")}`),
    );
  });
});
