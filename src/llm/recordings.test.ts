import { describe, expect, it } from "vitest";
import { formatErrors } from "../schema/errors.ts";
import { FIXTURES_DIR, fixtureClient } from "./fixtures.ts";
import { RECORDED_CALLS } from "./recordings.ts";

describe("the recorded calls", () => {
  const client = fixtureClient({ dir: FIXTURES_DIR });

  it.each(RECORDED_CALLS.map((call) => [call.name, call] as const))(
    "%s replays from its fixtures, with no key, to an answer that fits its schema",
    async (_name, call) => {
      const result = await call.run(client);
      expect(result.ok ? [] : formatErrors(result.errors)).toEqual([]);
    },
  );
});
