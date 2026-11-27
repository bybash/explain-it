import { describe, expect, it } from "vitest";
import exampleGraph from "../../examples/oauth-login/graph.json" with { type: "json" };
import exampleStoryboard from "../../examples/oauth-login/storyboard.json" with { type: "json" };
import { PALETTES } from "../engine/theme/palettes.ts";
import { CARD_LIMITS, parseCard } from "../schema/card.ts";
import { orThrow } from "../schema/errors.ts";
import { parseGraph } from "../schema/graph.ts";
import { parseStoryboard } from "../schema/storyboard.ts";
import { CARD_SIZE, cardHtml, defaultCard } from "./card.ts";

const graph = orThrow(parseGraph(exampleGraph), "graph");
const storyboard = orThrow(parseStoryboard(exampleStoryboard, graph), "storyboard");
const palette = (name: string) => {
  const preset = PALETTES[name];
  if (!preset) throw new Error(`no palette "${name}"`);
  return preset;
};

describe("card.json", () => {
  it("takes a title and one to three bullets, each within its length", () => {
    expect(
      parseCard({ version: 1, title: "Sign in with OAuth", bullets: ["One password"] }).ok,
    ).toBe(true);
    const tooMany = parseCard({ version: 1, title: "T", bullets: ["a", "b", "c", "d"] });
    expect(tooMany.ok ? [] : tooMany.errors.map((e) => e.path)).toEqual(["bullets"]);
    const long = parseCard({
      version: 1,
      title: "T",
      bullets: ["x".repeat(CARD_LIMITS.bullet + 1)],
    });
    expect(long.ok ? [] : long.errors.map((e) => e.path)).toEqual(["bullets[0]"]);
  });
});

describe("defaultCard", () => {
  it("names the video, and gives where each scene lands: its last caption", () => {
    expect(parseCard(defaultCard(graph.title, storyboard)).ok).toBe(true);
    expect(defaultCard(graph.title, storyboard)).toEqual({
      version: 1,
      title: "Signing in with OAuth",
      bullets: [
        "The browser passes the code to the app.",
        "Signed in, without sharing a password.",
      ],
    });
  });

  it("takes the last three scenes of a longer script, where the video lands", () => {
    const four = {
      ...storyboard,
      scenes: [0, 1, 2, 3].map((n) => ({
        ...storyboard.scenes[0],
        id: `s${n}`,
        beats: (storyboard.scenes[0]?.beats ?? []).map((b) => ({
          ...b,
          caption: `Scene ${n} lands.`,
        })),
      })),
    } as typeof storyboard;
    expect(defaultCard("T", four).bullets).toEqual([
      "Scene 1 lands.",
      "Scene 2 lands.",
      "Scene 3 lands.",
    ]);
  });

  it("keeps to the card's own limits, however long the script's words are", () => {
    const long = "word ".repeat(40).trim();
    const card = defaultCard(long, {
      ...storyboard,
      scenes: storyboard.scenes.map((s) => ({
        ...s,
        beats: s.beats.map((b) => ({ ...b, caption: long.slice(0, 60) })),
      })),
    });
    expect(parseCard(card).ok).toBe(true);
    expect(card.title.endsWith("…")).toBe(true);
  });
});

describe("cardHtml", () => {
  it("lays the title, the bullets and the still out at the link-preview size, its words escaped", () => {
    const html = cardHtml(
      { version: 1, title: "A <b>bold</b> change", bullets: ["One & two"] },
      { still: "data:image/png;base64,AAAA", colours: palette("default").light },
    );
    expect(CARD_SIZE).toEqual({ width: 1200, height: 630 });
    expect(html).toContain("A &#60;b&#62;bold&#60;/b&#62; change");
    expect(html).toContain("<li>One &#38; two</li>");
    expect(html).toContain('src="data:image/png;base64,AAAA"');
  });

  it("draws in the video's palette, in its theme", () => {
    const card = { version: 1 as const, title: "T", bullets: ["b"] };
    const ocean = palette("ocean");
    expect(cardHtml(card, { still: "", colours: ocean.dark })).toContain(
      `background: ${ocean.dark.background}`,
    );
    expect(cardHtml(card, { still: "", colours: ocean.light })).toContain(ocean.light.accent);
  });
});
