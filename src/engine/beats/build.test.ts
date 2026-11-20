import fc from "fast-check";
import { describe, expect, it } from "vitest";
import graphJson from "../../../examples/oauth-login/graph.json" with { type: "json" };
import storyboardJson from "../../../examples/oauth-login/storyboard.json" with { type: "json" };
import { formatErrors, type Validated } from "../../schema/errors.ts";
import { parseGraph } from "../../schema/graph.ts";
import { parseStoryboard } from "../../schema/storyboard.ts";
import { edgeTarget } from "../edges/flow.ts";
import { nodeTarget, zoneTarget } from "../iso/tweens.ts";
import { overlayTarget } from "../overlays/tweens.ts";
import { timeline } from "../timeline.ts";
import { type BeatPlan, buildBeats, SCENE_TIMING, sceneTarget, scoped } from "./build.ts";
import { BEAT_PADDING, estimateNarration } from "./timing.ts";

const unwrap = <T>(result: Validated<T>): T => {
  if (!result.ok) throw new Error(formatErrors(result.errors).join("\n"));
  return result.value;
};

const graph = unwrap(parseGraph(graphJson));
const storyboard = unwrap(parseStoryboard(storyboardJson, graph));
const { transition, tail } = SCENE_TIMING;

const seeker = (plan: BeatPlan) => {
  const tl = plan.tweens.reduce((b, t) => b.add(t), timeline()).build();
  return (t: number, target: string) => tl.seek(t)[target] ?? {};
};

const spanOf = <T extends { readonly id: string }>(spans: readonly T[], id: string): T => {
  const span = spans.find((s) => s.id === id);
  if (!span) throw new Error(`no span "${id}"`);
  return span;
};

describe("buildBeats: spans", () => {
  it("times each beat from its narration and actions, one after another", () => {
    const plan = buildBeats(storyboard, graph);
    // "A user opens the app and clicks Sign in." is 9 words: 3.6 s, plus 0.6 s.
    expect(spanOf(plan.beats, "start")).toMatchObject({
      start: 0,
      end: expect.closeTo(4.2),
      scene: "sign_in",
    });
    const sceneOne = plan.beats.filter((b) => b.scene === "sign_in");
    for (const [i, beat] of sceneOne.entries())
      expect(beat.start).toBeCloseTo(sceneOne[i - 1]?.end ?? 0);
  });

  it("uses measured narration lengths where it has them", () => {
    const plan = buildBeats(storyboard, graph, { narration: { start: 6 } });
    expect(spanOf(plan.beats, "start").end).toBeCloseTo(6.6);
  });

  it("starts the next scene after a transition, and ends after a short hold", () => {
    const plan = buildBeats(storyboard, graph);
    const [first, second] = plan.scenes;
    if (!first || !second) throw new Error("the example has two scenes");
    expect(first).toMatchObject({ id: "sign_in", index: 0, start: 0 });
    expect(first.end).toBeCloseTo(spanOf(plan.beats, "callback").end);
    expect(second.start).toBeCloseTo(first.end + transition);
    expect(spanOf(plan.beats, "swap").start).toBeCloseTo(second.start);
    expect(plan.duration).toBeCloseTo(second.end + tail);
  });

  it("lists each scene's nodes, and the edges it flows in the order they first flow", () => {
    const [first] = buildBeats(storyboard, graph).scenes;
    expect(first?.nodes).toEqual(["user", "browser", "app", "idp"]);
    expect(first?.edges).toEqual(["click", "login", "authorize", "code", "callback"]);
  });

  it("labels a flowed edge with the flow's own label where it has one", () => {
    const relabelled = {
      ...storyboard,
      scenes: storyboard.scenes.map((scene, i) =>
        i > 0
          ? scene
          : {
              ...scene,
              beats: scene.beats.map((b) =>
                b.id === "start"
                  ? {
                      ...b,
                      actions: b.actions.map((a) =>
                        a.type === "flow" ? { ...a, label: "clicks" } : a,
                      ),
                    }
                  : b,
              ),
            },
      ),
    };
    const [first, second] = buildBeats(relabelled, graph).scenes;
    expect(first?.edgeLabels).toEqual({ click: "clicks" });
    expect(second?.edgeLabels).toEqual({});
  });

  it("crossfades from one scene to the next", () => {
    const plan = buildBeats(storyboard, graph);
    const [first, second] = plan.scenes;
    if (!first || !second) throw new Error("the example has two scenes");
    const at = seeker(plan);
    const one = sceneTarget("sign_in");
    const two = sceneTarget("exchange");
    expect(at(0, one).opacity ?? 1).toBe(1);
    expect(at(first.end, one).opacity).toBe(1);
    expect(at(first.end, two).opacity).toBe(0);
    const middle = first.end + transition / 2;
    expect(at(middle, one).opacity).toBeGreaterThan(0);
    expect(at(middle, two).opacity).toBeGreaterThan(0);
    expect(at(second.start, one).opacity).toBe(0);
    expect(at(second.start, two).opacity).toBe(1);
    expect(at(plan.duration, two).opacity).toBe(1);
  });
});

describe("buildBeats: actions", () => {
  const plan = buildBeats(storyboard, graph);
  const at = seeker(plan);
  const [first, second] = plan.scenes;
  if (!first || !second) throw new Error("the example has two scenes");
  const node = (scene: string, id: string) => nodeTarget(scoped(scene, id));
  const edge = (scene: string, id: string) => edgeTarget(scoped(scene, id));
  const beat = (id: string) => spanOf(plan.beats, id);

  it("hides a node until it appears, then shows it", () => {
    const start = beat("start");
    expect(at(start.start, node("sign_in", "user")).shown).toBe(0);
    expect(at(start.end, node("sign_in", "user")).shown).toBe(1);
    expect(at(start.end, node("sign_in", "idp")).shown).toBe(0);
    expect(at(beat("hand_off").end, node("sign_in", "idp")).shown).toBe(1);
  });

  it("raises a zone's platform with the first of its nodes to appear", () => {
    const backend = zoneTarget(scoped("sign_in", "backend"));
    expect(at(beat("start").end, backend).shown).toBe(0);
    const hand = beat("hand_off");
    expect(at(hand.start, backend).shown).toBe(0);
    expect(at(hand.end, backend).shown).toBe(1);
    expect(at(hand.end, node("sign_in", "app")).shown).toBe(1);
  });

  it("shows a zone from the start when one of its nodes is there from the start", () => {
    expect(at(second.start, zoneTarget(scoped("exchange", "backend"))).shown).toBeUndefined();
  });

  it("shows a scene's other nodes from its start", () => {
    expect(at(second.start, node("exchange", "browser")).shown).toBeUndefined();
    expect(at(second.start, node("exchange", "sessions")).shown).toBe(0);
  });

  it("draws a flowed edge within its beat, and stops its dashes once the scene has gone", () => {
    expect(at(0, edge("sign_in", "click")).draw).toBe(0);
    expect(at(beat("start").end, edge("sign_in", "click")).draw).toBe(1);
    expect(at(beat("swap").start, edge("exchange", "exchange")).draw).toBe(0);
    const dashes = (t: number) => at(t, edge("sign_in", "click")).dash;
    expect(dashes(first.end)).toBeLessThan(dashes(second.start) ?? 0);
    expect(dashes(second.start)).toBeCloseTo(dashes(plan.duration) ?? 0);
  });

  it("pulses a highlighted node and lets it settle within the beat", () => {
    const consent = beat("consent");
    const pulse = (t: number) => at(t, node("sign_in", "idp")).pulse ?? 0;
    const peak = Math.max(
      ...Array.from({ length: 50 }, (_, i) =>
        pulse(consent.start + (i / 50) * (consent.end - consent.start)),
      ),
    );
    expect(peak).toBeGreaterThan(0.9);
    expect(pulse(consent.end)).toBe(0);
  });

  it("dims every node but the kept ones, and the edges that touch a dimmed node", () => {
    const end = plan.duration;
    expect(at(end, node("exchange", "idp")).dim).toBe(1);
    expect(at(end, node("exchange", "sessions")).dim).toBe(1);
    expect(at(end, node("exchange", "app")).dim).toBeUndefined();
    expect(at(end, edge("exchange", "exchange")).dim).toBe(1);
    expect(at(end, edge("exchange", "fetch")).dim).toBeUndefined();
    expect(at(beat("done").start, node("exchange", "idp")).dim).toBe(0);
  });

  it("shows each scene's title for the scene, and each step caption for its beat", () => {
    const titles = plan.overlays.filter((o) => o.kind === "title");
    expect(titles.map((o) => [o.scene, o.text])).toEqual([
      ["sign_in", "1 · Sign in"],
      ["exchange", "2 · Token exchange"],
    ]);
    expect(titles[0]).toMatchObject({ at: 0, until: expect.closeTo(first.end + transition) });
    expect(titles[1]).toMatchObject({ until: plan.duration });
    const steps = plan.overlays.filter((o) => o.kind === "step");
    expect(steps).toHaveLength(plan.beats.length);
    expect(steps[0]).toMatchObject({
      text: "A user wants to sign in.",
      at: 0,
      until: beat("start").end,
    });
  });

  it("keeps a callout up until the narration ends", () => {
    const consent = beat("consent");
    const say = "The user signs in there, and agrees to share their photos with the app.";
    const narrationEnd = consent.start + BEAT_PADDING + estimateNarration(say);
    const callout = plan.overlays.find((o) => o.kind === "callout" && o.scene === "sign_in");
    expect(callout).toMatchObject({
      node: "idp",
      title: "One password",
      until: expect.closeTo(narrationEnd),
    });
    const opacity = (t: number) => at(t, overlayTarget(callout?.id ?? "")).opacity;
    expect(opacity(narrationEnd - 0.35)).toBe(1);
    expect(opacity(narrationEnd)).toBe(0);
  });

  it("keeps a badge on its node for the rest of the scene", () => {
    const badges = plan.overlays.filter((o) => o.kind === "badge");
    expect(badges.map((o) => [o.node, o.text, o.tone])).toEqual([
      ["browser", "code", "info"],
      ["app", "token", "ok"],
    ]);
    expect(badges[0]?.until).toBeCloseTo(first.end + transition);
    expect(badges[1]?.until).toBe(plan.duration);
  });

  it("gives every overlay its own id", () => {
    const ids = plan.overlays.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("buildBeats: narration", () => {
  const plan = buildBeats(storyboard, graph);
  const beat = (id: string) => spanOf(plan.beats, id);

  it("shows a short narration line as one cue while it is said", () => {
    const start = beat("start");
    const cues = plan.cues.filter((c) => c.beat === "start");
    expect(cues).toEqual([
      {
        beat: "start",
        text: "A user opens the app and clicks Sign in.",
        start: BEAT_PADDING,
        end: expect.closeTo(start.start + BEAT_PADDING + 3.6),
      },
    ]);
  });

  it("splits a long line into cues that follow each other through the narration", () => {
    const swap = beat("swap");
    const cues = plan.cues.filter((c) => c.beat === "swap");
    expect(cues.map((c) => c.text)).toEqual([
      "Now the app talks to the provider directly, server to server,",
      "and swaps the code for a token.",
    ]);
    const [one, two] = cues;
    expect(one?.start).toBeCloseTo(swap.start + BEAT_PADDING);
    expect(two?.start).toBeCloseTo(one?.end ?? 0);
    expect(two?.end).toBeCloseTo(swap.end - BEAT_PADDING);
    // The longer cue is on screen for longer.
    expect((one?.end ?? 0) - (one?.start ?? 0)).toBeGreaterThan(
      (two?.end ?? 0) - (two?.start ?? 0),
    );
  });

  it("draws each cue as a narration caption on its scene's layer", () => {
    const captions = plan.overlays.filter((o) => o.kind === "narration");
    expect(captions.map((o) => [o.text, o.at, o.until])).toEqual(
      plan.cues.map((c) => [c.text, c.start, c.end]),
    );
    expect(captions.find((o) => o.text.startsWith("and swaps"))?.scene).toBe("exchange");
  });

  it("puts nothing outside the timeline and nothing out of order, for any narration lengths", () => {
    const ids = storyboard.scenes.flatMap((s) => s.beats.map((b) => b.id));
    const lengths = fc.dictionary(
      fc.constantFrom(...ids),
      fc.double({ min: 0.1, max: 30, noNaN: true }),
    );
    fc.assert(
      fc.property(lengths, (narration) => {
        const plan = buildBeats(storyboard, graph, { narration });
        expect(buildBeats(storyboard, graph, { narration })).toEqual(plan);
        const within = (t: number) => t >= 0 && t <= plan.duration + 1e-9;
        for (const [i, b] of plan.beats.entries()) {
          expect(b.end).toBeGreaterThan(b.start);
          expect(b.start).toBeGreaterThanOrEqual((plan.beats[i - 1]?.end ?? 0) - 1e-9);
        }
        for (const o of plan.overlays) {
          expect(within(o.at) && within(o.until)).toBe(true);
          expect(o.until).toBeGreaterThan(o.at);
        }
        for (const [i, c] of plan.cues.entries()) {
          const b = spanOf(plan.beats, c.beat);
          expect(c.start).toBeGreaterThanOrEqual(b.start);
          expect(c.end).toBeLessThanOrEqual(b.end + 1e-9);
          expect(c.start).toBeGreaterThanOrEqual((plan.cues[i - 1]?.end ?? 0) - 1e-9);
        }
        for (const t of plan.tweens)
          expect(within(Number(t.at)) && within(Number(t.at) + t.duration)).toBe(true);
      }),
    );
  });
});
