import { describe, expect, it } from "vitest";
import configJson from "../../examples/oauth-login/config.json" with { type: "json" };
import graphJson from "../../examples/oauth-login/graph.json" with { type: "json" };
import storyboardJson from "../../examples/oauth-login/storyboard.json" with { type: "json" };
import { projectBeats } from "../engine/beats/build.ts";
import { parseConfig } from "../schema/config.ts";
import { orThrow } from "../schema/errors.ts";
import { parseGraph } from "../schema/graph.ts";
import type { Beat, Storyboard } from "../schema/storyboard.ts";
import { storyWarnings } from "./story.ts";

const graph = orThrow(parseGraph(graphJson), "graph.json");
const config = orThrow(parseConfig(configJson), "config.json");
const example = orThrow(
  (await import("../schema/storyboard.ts")).parseStoryboard(storyboardJson, graph),
  "storyboard.json",
);
const warnings = (storyboard: Storyboard) =>
  storyWarnings(projectBeats({ storyboard, graph, config }), storyboard);

/** The example with each beat changed by `change`, by its place in the whole script. */
const changed = (change: (beat: Beat, i: number, count: number) => Beat): Storyboard => {
  const count = example.scenes.flatMap((s) => s.beats).length;
  let i = 0;
  return {
    ...example,
    scenes: example.scenes.map((s) => ({ ...s, beats: s.beats.map((b) => change(b, i++, count)) })),
  };
};

describe("storyWarnings", () => {
  it("finds nothing in the example", () => {
    expect(warnings(example)).toEqual([]);
  });

  it("catches a first beat with no narration, or one too long for a hook", () => {
    const opening = example.scenes[0]?.beats[0];
    if (!opening) throw new Error("the example has no beat");
    const { say: _, ...silent } = opening;
    const quiet = changed((b, i) => (i === 0 ? silent : b));
    expect(warnings(quiet).map((w) => w.check)).toContain("hook");
    const long = changed((b, i) =>
      i === 0
        ? {
            ...b,
            say: "A user opens the app on their phone, taps Sign in, and waits while the app gets ready to send them to the provider.",
          }
        : b,
    );
    expect(warnings(long)).toContainEqual(
      expect.objectContaining({ check: "hook", beat: "start" }),
    );
  });

  it("catches a script that ends on another step, not on the outcome", () => {
    const lastFlow = example.scenes[0]?.beats.find((b) => b.actions.some((a) => a.type === "flow"));
    const flow = lastFlow?.actions.find((a) => a.type === "flow");
    const endsMidway = changed((b, i, count) =>
      i === count - 1 && flow ? { ...b, actions: [...b.actions, flow] } : b,
    );
    expect(warnings(endsMidway)).toContainEqual(
      expect.objectContaining({ check: "outcome", beat: "done" }),
    );
  });

  it("catches a narrated beat that does more than one thing", () => {
    const busy = changed((b, i) =>
      i === 2 ? { ...b, say: "First this. Then that. And then one more thing." } : b,
    );
    expect(warnings(busy)).toContainEqual(
      expect.objectContaining({ check: "one-thing", beat: "consent" }),
    );
  });

  it("catches a video too short to explain, or too long to be watched", () => {
    const short: Storyboard = {
      ...example,
      scenes: [
        {
          ...(example.scenes[0] as Storyboard["scenes"][number]),
          beats: example.scenes[0]?.beats.slice(0, 3) ?? [],
        },
      ],
    };
    expect(warnings(short)).toContainEqual(expect.objectContaining({ check: "length" }));
  });
});
