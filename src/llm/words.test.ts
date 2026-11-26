import { describe, expect, it } from "vitest";
import { ok } from "../schema/result.ts";
import { fakeLlm } from "./fake-llm.testing.ts";
import { FIXTURES_DIR, fixtureClient } from "./fixtures.ts";
import { RUSHED_ABOUT, RUSHED_LINE } from "./recordings.ts";
import { shorterWords } from "./words.ts";

describe("shorterWords", () => {
  it("sends back words still too long, or unchanged, and takes ones that fit", async () => {
    const { client, asked } = fakeLlm([
      JSON.stringify({ text: RUSHED_LINE.text }),
      JSON.stringify({ text: "x".repeat(RUSHED_LINE.most + 1) }),
      JSON.stringify({ text: "The provider sends back a one-time code." }),
    ]);
    expect(await shorterWords(client, RUSHED_LINE, RUSHED_ABOUT)).toEqual(
      ok("The provider sends back a one-time code."),
    );
    expect(asked).toHaveLength(3);
    expect(asked[0]?.messages[0]?.content).toContain(`at most ${RUSHED_LINE.most} characters`);
  });

  it("gives up when there is no LLM to ask", async () => {
    const { client } = fakeLlm([{ error: "no API key in Settings" }]);
    expect((await shorterWords(client, RUSHED_LINE, RUSHED_ABOUT)).ok).toBe(false);
  });

  it("shortens the example's rushed line, as recorded with a real model", async () => {
    const words = await shorterWords(
      fixtureClient({ dir: FIXTURES_DIR }),
      RUSHED_LINE,
      RUSHED_ABOUT,
    );
    expect(words.ok && words.value.length).toBeLessThanOrEqual(RUSHED_LINE.most);
    expect(words.ok && words.value).toMatch(/code/);
  });
});
