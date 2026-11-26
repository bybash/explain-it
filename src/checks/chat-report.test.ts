import { describe, expect, it } from "vitest";
import graphJson from "../../examples/oauth-login/graph.json" with { type: "json" };
import storyboardJson from "../../examples/oauth-login/storyboard.json" with { type: "json" };
import { projectBeats } from "../engine/beats/build.ts";
import type { CheckWarning } from "../schema/checks.ts";
import { DEFAULT_CONFIG } from "../schema/config.ts";
import { orThrow } from "../schema/errors.ts";
import { parseGraph } from "../schema/graph.ts";
import { parseStoryboard, type Storyboard } from "../schema/storyboard.ts";
import { problemKey, sayProblem, wordProblems } from "./chat-report.ts";
import { readingProblems } from "./timing.ts";

const graph = orThrow(parseGraph(graphJson), "graph.json");
const example = orThrow(parseStoryboard(storyboardJson, graph), "storyboard.json");
const config = DEFAULT_CONFIG;
const B1 = example.scenes[0]?.beats[0]?.id ?? "";

/** The example with its first beat's line replaced. */
const saying = (say: string): Storyboard => ({
  ...example,
  scenes: example.scenes.map((s, i) =>
    i === 0 ? { ...s, beats: s.beats.map((b, j) => (j === 0 ? { ...b, say } : b)) } : s,
  ),
});

/** A first line, measured as said in so little time that its captions go by too fast. */
const rushed = () => {
  const storyboard = saying(
    "A user opens the app, clicks Sign in, and the browser goes to the login page.",
  );
  const narration = { [B1]: 1 };
  return { storyboard, narration, plan: projectBeats({ storyboard, graph, config, narration }) };
};

describe("wordProblems", () => {
  it("names a line read too fast, with the most characters that would fit", () => {
    const { storyboard, narration, plan } = rushed();
    expect(readingProblems(plan).some((p) => p.beat.id === B1)).toBe(true);
    const found = wordProblems(plan, storyboard, narration).find((p) => p.beat === B1);
    expect(found).toMatchObject({ field: "say", text: storyboard.scenes[0]?.beats[0]?.say });
    // Shorter than the line, and short enough to be read in the time it is on screen.
    expect(found?.most).toBeLessThan(found?.text.length ?? 0);
    expect(found?.most).toBeGreaterThan(0);
  });

  it("names nothing in a script that reads in time", () => {
    const narration = {};
    const plan = projectBeats({ storyboard: example, graph, config, narration });
    const found = wordProblems(plan, example, narration).map((p) => p.beat);
    expect(found).toEqual(readingProblems(plan).map((p) => p.beat.id));
  });

  it("names a beat's line once, however many of its captions go too fast", () => {
    const { storyboard, narration, plan } = rushed();
    const ofB1 = wordProblems(plan, storyboard, narration).filter((p) => p.beat === B1);
    expect(ofB1).toHaveLength(1);
  });
});

describe("sayProblem", () => {
  it("says each problem in plain words, naming the beat", () => {
    expect(
      sayProblem({ kind: "words", beat: "b1", field: "say", why: "read", text: "x", most: 1 }),
    ).toBe('The line of beat "b1" goes by too fast to read.');
    expect(
      sayProblem({ kind: "words", beat: "b1", field: "say", why: "fit", text: "x", most: 1 }),
    ).toBe('The line of beat "b1" is too long to say in its beat.');
    expect(
      sayProblem({ kind: "words", beat: "b1", field: "caption", why: "read", text: "x", most: 1 }),
    ).toBe('The caption of beat "b1" goes by too fast to read.');
    const overlap: CheckWarning = {
      check: "overlap",
      scene: "s",
      beat: "b2",
      at: 3,
      nodes: ["app", "idp"],
      message: 'node "app" and node "idp" overlap by 50 px',
    };
    expect(sayProblem({ kind: "warning", warning: overlap })).toBe(
      'In beat "b2", node "app" and node "idp" overlap by 50 px.',
    );
    expect(
      sayProblem({
        kind: "warning",
        warning: { check: "loudness", message: "the mix is at -18 LUFS" },
      }),
    ).toBe("The mix is at -18 LUFS.");
  });
});

describe("problemKey", () => {
  it("stays the same while the problem is the same one, however much it is by", () => {
    const at = (px: number): CheckWarning => ({
      check: "overlap",
      scene: "s",
      beat: "b2",
      at: 3,
      px,
      nodes: ["idp", "app"],
      message: `overlap by ${px} px`,
    });
    expect(problemKey({ kind: "warning", warning: at(50) })).toBe(
      problemKey({ kind: "warning", warning: at(20) }),
    );
    expect(
      problemKey({ kind: "words", beat: "b1", field: "say", why: "read", text: "a", most: 1 }),
    ).toBe(
      problemKey({
        kind: "words",
        beat: "b1",
        field: "say",
        why: "read",
        text: "a longer line",
        most: 3,
      }),
    );
  });
});
