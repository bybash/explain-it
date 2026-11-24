import { describe, expect, it } from "vitest";
import { formatErrors } from "../schema/errors.ts";
import { FIXTURES_DIR, fixtureClient } from "./fixtures.ts";
import { RECORDED_CALLS } from "./recordings.ts";
import { structuredCall } from "./structured.ts";

describe("the recorded calls", () => {
  const client = fixtureClient({ dir: FIXTURES_DIR });

  it.each(RECORDED_CALLS.map((call) => [call.name, call] as const))(
    "%s replays from its fixtures, with no key, to an answer that fits its schema",
    async (_name, call) => {
      // The calls differ in their schemas; each is checked against its own.
      const result = await structuredCall(client, call as Parameters<typeof structuredCall>[1]);
      expect(result.ok ? [] : formatErrors(result.errors)).toEqual([]);
    },
  );
});
