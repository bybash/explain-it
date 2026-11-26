import fc from "fast-check";
import { describe, expect, it } from "vitest";
import graphJson from "../../../examples/oauth-login/graph.json" with { type: "json" };
import storyboardJson from "../../../examples/oauth-login/storyboard.json" with { type: "json" };
import { DEFAULT_CONFIG, PACE_TIMINGS } from "../../schema/config.ts";
import { formatErrors, type Validated } from "../../schema/errors.ts";
import { parseGraph } from "../../schema/graph.ts";
import { parseStoryboard } from "../../schema/storyboard.ts";
import { edgeTarget } from "../edges/flow.ts";
import { nodeTarget, zoneTarget } from "../iso/tweens.ts";
import { overlayTarget } from "../overlays/tweens.ts";
import { timeline } from "../timeline.ts";
import {
  type BeatPlan,
  beatOptions,
  buildBeats,
  cardTarget,
  SCENE_TIMING,
  sceneTarget,
  scoped,
} from "./build.ts";
import dimFocusFixture from "./dim-focus.fixture.json" with { type: "json" };
import { estimateNarration, LEAD_IN } from "./timing.ts";

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
    // "A user opens the app and clicks Sign in." is 9 words: 3.6 s, after the
    // 0.3 s lead-in and before the relaxed pace's 1 s pause.
    expect(spanOf(plan.beats, "start")).toMatchObject({
      start: 0,
      end: expect.closeTo(4.9),
      scene: "sign_in",
    });
    const sceneOne = plan.beats.filter((b) => b.scene === "sign_in");
    for (const [i, beat] of sceneOne.entries())
      expect(beat.start).toBeCloseTo(sceneOne[i - 1]?.end ?? 0);
  });

  it("follows measured narration, longer or shorter than the estimate", () => {
    const longer = buildBeats(storyboard, graph, { narration: { start: 6 } });
    expect(spanOf(longer.beats, "start").end).toBeCloseTo(LEAD_IN + 6 + 1);
    // Shorter than its two appears and a flow (3.2 s): the beat waits for them at normal speed.
    const shorter = buildBeats(storyboard, graph, { narration: { start: 2.5 } });
    expect(spanOf(shorter.beats, "start").end).toBeCloseTo(LEAD_IN + 3.2 + 1);
  });

  it("takes its pace and whether the voice speaks from the project's config", () => {
    const brisk = buildBeats(
      storyboard,
      graph,
      beatOptions({ ...DEFAULT_CONFIG, pacing: "brisk" }),
    );
    expect(spanOf(brisk.beats, "start").end).toBeCloseTo(
      LEAD_IN + 3.6 + PACE_TIMINGS.brisk.pauseAfter,
    );
    const silent = buildBeats(
      storyboard,
      graph,
      beatOptions({ ...DEFAULT_CONFIG, voice: { ...DEFAULT_CONFIG.voice, enabled: false } }),
    );
    // Read, not spoken: 40 characters at 15 a second, so its 3.2 s of actions set the beat.
    expect(spanOf(silent.beats, "start").end).toBeCloseTo(LEAD_IN + 3.2 + 1);
    const long = buildBeats(storyboard, graph, {
      ...beatOptions({ ...DEFAULT_CONFIG, voice: { ...DEFAULT_CONFIG.voice, enabled: false } }),
      narration: { start: 9 },
    });
    // A measured length means nothing without a voice.
    expect(spanOf(long.beats, "start").end).toBeCloseTo(LEAD_IN + 3.2 + 1);
  });

  it("starts the next scene after a transition, and ends on a short hold of the empty background", () => {
    const plan = buildBeats(storyboard, graph);
    const [first, second] = plan.scenes;
    if (!first || !second) throw new Error("the example has two scenes");
    expect(first).toMatchObject({ id: "sign_in", index: 0, start: 0 });
    expect(first.end).toBeCloseTo(spanOf(plan.beats, "callback").end);
    expect(second.start).toBeCloseTo(first.end + transition);
    expect(spanOf(plan.beats, "swap").start).toBeCloseTo(second.start);
    expect(plan.duration).toBeCloseTo(second.end + transition + tail);
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
    expect(at(second.end, two).opacity).toBe(1);
    expect(at(second.end + transition, two).opacity).toBe(0);
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

  it("numbers no scene when there is only one", () => {
    const one = { ...storyboard, scenes: storyboard.scenes.slice(0, 1) };
    const titles = buildBeats(one, graph).overlays.filter((o) => o.kind === "title");
    expect(titles.map((o) => o.text)).toEqual(["Sign in"]);
  });

  it("shows each scene's title for the scene, and each step caption for its beat", () => {
    const titles = plan.overlays.filter((o) => o.kind === "title");
    expect(titles.map((o) => [o.scene, o.text])).toEqual([
      ["sign_in", "1 · Sign in"],
      ["exchange", "2 · Token exchange"],
    ]);
    expect(titles[0]).toMatchObject({ at: 0, until: expect.closeTo(first.end + transition) });
    expect(titles[1]).toMatchObject({ until: expect.closeTo(second.end + transition) });
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
    const narrationEnd = consent.start + LEAD_IN + estimateNarration(say);
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
    expect(badges[1]?.until).toBeCloseTo(second.end + transition);
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
        start: LEAD_IN,
        end: expect.closeTo(start.start + LEAD_IN + 3.6),
      },
    ]);
  });

  it("keeps every cue inside its spoken line, whatever the line measured", () => {
    const said = storyboard.scenes.flatMap((scene) => scene.beats).filter((b) => b.say);
    // Lines spoken slower and faster than the estimate, in turn.
    const narration = Object.fromEntries(
      said.map((b, i) => [b.id, estimateNarration(b.say ?? "") * (i % 2 === 0 ? 1.4 : 0.7)]),
    );
    const measured = buildBeats(storyboard, graph, { narration });
    for (const b of said) {
      const span = spanOf(measured.beats, b.id);
      const spoken = {
        start: span.start + LEAD_IN,
        end: span.start + LEAD_IN + (narration[b.id] ?? 0),
      };
      const cues = measured.cues.filter((c) => c.beat === b.id);
      expect(cues.length).toBeGreaterThan(0);
      expect(cues[0]?.start).toBeCloseTo(spoken.start);
      expect(cues.at(-1)?.end).toBeCloseTo(spoken.end);
      for (const cue of cues) {
        expect(cue.start).toBeGreaterThanOrEqual(spoken.start - 1e-9);
        expect(cue.end).toBeLessThanOrEqual(spoken.end + 1e-9);
      }
    }
  });

  it("splits a long line into cues that follow each other through the narration", () => {
    const swap = beat("swap");
    const cues = plan.cues.filter((c) => c.beat === "swap");
    expect(cues.map((c) => c.text)).toEqual([
      "Now the app talks to the provider directly, server to server,",
      "and swaps the code for a token.",
    ]);
    const [one, two] = cues;
    expect(one?.start).toBeCloseTo(swap.start + LEAD_IN);
    expect(two?.start).toBeCloseTo(one?.end ?? 0);
    expect(two?.end).toBeCloseTo(swap.end - PACE_TIMINGS.relaxed.pauseAfter);
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

describe("buildBeats: title card", () => {
  const short = { title: "Signing in with OAuth" };
  // 40 + 40 characters at 20 a second: 4 s, longer than the 3 s minimum.
  const longer = { title: "t".repeat(40), description: "d".repeat(40) };
  // 60 + 100 characters: 8 s at that speed, held 5 s at most.
  const long = { title: "t".repeat(60), description: "d".repeat(100) };
  const card = cardTarget("title");

  it("is fully shown from the first frame and held at least 3 s", () => {
    const plan = buildBeats(storyboard, graph, { titleCard: short });
    expect(plan.cards[0]).toEqual({ id: "title", start: 0, end: 3, until: 3 + transition });
    const at = seeker(plan);
    expect(at(0, card).opacity).toBe(1);
    expect(at(2.99, card).opacity).toBe(1);
  });

  it("holds longer when its text needs it, at 20 characters a second, and 5 s at most", () => {
    expect(
      spanOf(buildBeats(storyboard, graph, { titleCard: longer }).cards, "title").end,
    ).toBeCloseTo(4);
    expect(spanOf(buildBeats(storyboard, graph, { titleCard: long }).cards, "title").end).toBe(5);
  });

  it("holds as long as the user set, whatever its text", () => {
    const set = buildBeats(storyboard, graph, { titleCard: { ...long, seconds: 8 } });
    expect(spanOf(set.cards, "title").end).toBe(8);
    const brief = buildBeats(storyboard, graph, { titleCard: { ...short, seconds: 2 } });
    expect(spanOf(brief.cards, "title").end).toBe(2);
  });

  it("fades out over the transition as the first scene fades in", () => {
    const plan = buildBeats(storyboard, graph, { titleCard: short });
    const at = seeker(plan);
    const first = sceneTarget("sign_in");
    expect(spanOf(plan.scenes, "sign_in").start).toBeCloseTo(3 + transition);
    expect(at(2.99, first).opacity).toBe(0);
    expect(at(3 + transition / 2, card).opacity).toBeCloseTo(0.5);
    expect(at(3 + transition / 2, first).opacity).toBeCloseTo(0.5);
    expect(at(3 + transition, card).opacity).toBe(0);
    expect(at(3 + transition, first).opacity).toBe(1);
  });

  it("moves every scene, beat, overlay and cue later by the card and its transition", () => {
    const without = buildBeats(storyboard, graph);
    const plan = buildBeats(storyboard, graph, { titleCard: short });
    const shift = 3 + transition;
    // Times add up in a different order, so compare them to 9 decimals.
    const rounded = (value: unknown) =>
      JSON.parse(JSON.stringify(value, (_, v) => (typeof v === "number" ? +v.toFixed(9) : v)));
    const moved = <T extends { start: number; end: number }>(spans: readonly T[]) =>
      spans.map((s) => ({ ...s, start: s.start + shift, end: s.end + shift }));
    expect(rounded(plan.scenes)).toEqual(rounded(moved(without.scenes)));
    expect(rounded(plan.beats)).toEqual(rounded(moved(without.beats)));
    expect(rounded(plan.cues)).toEqual(rounded(moved(without.cues)));
    expect(rounded(plan.overlays)).toEqual(
      rounded(without.overlays.map((o) => ({ ...o, at: o.at + shift, until: o.until + shift }))),
    );
    // Without an end card, the title card closes the video too, and holds as long.
    expect(plan.duration).toBeCloseTo(without.duration - tail + shift + 3);
  });

  it("is left out when there is none, and the first scene is shown from the start", () => {
    const plan = buildBeats(storyboard, graph);
    expect(plan.cards).toEqual([]);
    expect(seeker(plan)(0, sceneTarget("sign_in")).opacity ?? 1).toBe(1);
  });
});

describe("buildBeats: ending", () => {
  const title = { title: "Signing in with OAuth" };
  // 22 + 30 + 18 + 25 = 95 characters at 15 a second: about 6.33 s.
  const end = {
    headline: "Try it in your own app",
    link: "https://example.com/docs/oauth",
    where: "Settings › Sign-in",
    credit: "Made by the Identity team",
  };
  const lastScene = (plan: BeatPlan) => {
    const last = plan.scenes.at(-1);
    if (!last) throw new Error("no scenes");
    return last;
  };
  const closing = (plan: BeatPlan) => plan.cards.at(-1);

  it("closes on the end card, else the title card again, else the logo, else nothing", () => {
    expect(
      closing(buildBeats(storyboard, graph, { titleCard: title, endCard: end, logo: true }))?.id,
    ).toBe("end");
    expect(closing(buildBeats(storyboard, graph, { titleCard: title, logo: true }))?.id).toBe(
      "title-again",
    );
    expect(closing(buildBeats(storyboard, graph, { logo: true }))?.id).toBe("logo");
    expect(buildBeats(storyboard, graph).cards).toEqual([]);
  });

  it("fades the last scene out as the closing card fades in, then holds the card to the last frame", () => {
    const plan = buildBeats(storyboard, graph, { endCard: end });
    const at = seeker(plan);
    const last = lastScene(plan);
    const scene = sceneTarget(last.id);
    const card = cardTarget("end");
    expect(at(last.end, scene).opacity).toBe(1);
    expect(at(last.end, card).opacity).toBe(0);
    expect(at(last.end + transition / 2, card).opacity).toBeCloseTo(0.5);
    expect(at(last.end + transition, scene).opacity).toBe(0);
    expect(at(last.end + transition, card).opacity).toBe(1);
    expect(at(plan.duration, card).opacity).toBe(1);
    expect(closing(plan)).toEqual({
      id: "end",
      start: expect.closeTo(last.end + transition),
      end: plan.duration,
      until: plan.duration,
    });
  });

  it("holds the closing card at least 3 s, longer when its text needs it", () => {
    const hold = (options: Parameters<typeof buildBeats>[2]) => {
      const plan = buildBeats(storyboard, graph, options);
      const card = closing(plan);
      return card ? card.end - card.start : 0;
    };
    expect(hold({ endCard: end })).toBeCloseTo(95 / 15);
    expect(hold({ endCard: { headline: "Thanks" } })).toBeCloseTo(3);
    expect(hold({ logo: true })).toBeCloseTo(3);
    // The title card closing the video holds as it does at the start: 5 s at most, unless set.
    const long = { title: "t".repeat(60), description: "d".repeat(60) };
    expect(hold({ titleCard: long })).toBeCloseTo(5);
    expect(hold({ titleCard: { ...long, seconds: 7 } })).toBeCloseTo(7);
  });

  it("leaves nothing of the last scene on screen once its layer has faded", () => {
    const plan = buildBeats(storyboard, graph, { endCard: end });
    const last = lastScene(plan);
    const gone = last.end + transition;
    for (const overlay of plan.overlays.filter((o) => o.scene === last.id))
      expect(overlay.until).toBeLessThanOrEqual(gone + 1e-9);
  });
});

describe("buildBeats: a dim is its beat's focus", () => {
  const focusGraph = unwrap(
    parseGraph({
      version: 1,
      title: "Focus",
      nodes: [
        { id: "a", label: "A", kind: "service" },
        { id: "b", label: "B", kind: "service" },
        { id: "c", label: "C", kind: "service" },
      ],
      edges: [
        { id: "ab", from: "a", to: "b" },
        { id: "bc", from: "b", to: "c" },
      ],
      zones: [],
    }),
  );
  const focusBoard = unwrap(
    parseStoryboard(
      {
        version: 1,
        scenes: [
          {
            id: "s",
            title: "Focus",
            nodes: ["a", "b", "c"],
            beats: [
              {
                id: "one",
                caption: "A and B.",
                actions: [
                  { type: "dim", except: ["a", "b"] },
                  { type: "flow", edge: "ab" },
                ],
              },
              {
                id: "two",
                caption: "B and C.",
                actions: [
                  { type: "dim", except: ["b", "c"] },
                  { type: "flow", edge: "bc" },
                ],
              },
              { id: "three", caption: "All of it.", actions: [{ type: "highlight", node: "a" }] },
              { id: "four", caption: "Only A.", actions: [{ type: "dim", except: ["a"] }] },
            ],
          },
        ],
      },
      focusGraph,
    ),
  );
  const plan = buildBeats(focusBoard, focusGraph);
  const at = seeker(plan);
  const dim = (t: number, target: string) => at(t, target).dim ?? 0;
  const mid = (id: string) => {
    const b = spanOf(plan.beats, id);
    return (b.start + b.end) / 2;
  };
  const nodeOf = (id: string) => nodeTarget(scoped("s", id));
  const edgeOf = (id: string) => edgeTarget(scoped("s", id));

  it("fades what a beat does not keep, for that beat", () => {
    expect(dim(mid("one"), nodeOf("c"))).toBe(1);
    expect(dim(mid("one"), edgeOf("bc"))).toBe(1);
    expect(dim(mid("one"), nodeOf("a"))).toBe(0);
    expect(dim(mid("one"), edgeOf("ab"))).toBe(0);
  });

  it("brings back what a later dim keeps, so the focus moves", () => {
    expect(dim(mid("two"), nodeOf("c"))).toBe(0);
    expect(dim(mid("two"), edgeOf("bc"))).toBe(0);
    expect(dim(mid("two"), nodeOf("a"))).toBe(1);
    expect(dim(mid("two"), edgeOf("ab"))).toBe(1);
  });

  it("keeps a node both beats keep bright across the change, with no flash", () => {
    const one = spanOf(plan.beats, "one");
    const two = spanOf(plan.beats, "two");
    for (let t = one.start; t <= two.end; t += 0.05) expect(dim(t, nodeOf("b")), `at ${t}`).toBe(0);
  });

  it("brings everything back for a beat without a dim", () => {
    for (const target of [nodeOf("a"), nodeOf("b"), nodeOf("c"), edgeOf("ab"), edgeOf("bc")])
      expect(dim(mid("three"), target), target).toBe(0);
  });

  it("moves the focus within a beat at each of its dims", () => {
    const twice = unwrap(
      parseStoryboard(
        {
          version: 1,
          scenes: [
            {
              id: "s",
              title: "Twice",
              nodes: ["a", "b", "c"],
              beats: [
                {
                  id: "both",
                  caption: "A, then C.",
                  actions: [
                    { type: "dim", except: ["a"] },
                    { type: "flow", edge: "ab" },
                    { type: "dim", except: ["c"] },
                  ],
                },
                { id: "after", caption: "All.", actions: [] },
                { id: "end", caption: "End.", actions: [] },
              ],
            },
          ],
        },
        focusGraph,
      ),
    );
    const built = buildBeats(twice, focusGraph);
    const seek = seeker(built);
    const span = spanOf(built.beats, "both");
    // Early in the beat only A is kept; by its end only C is.
    expect(seek(span.start + 0.9, nodeOf("c")).dim ?? 0).toBe(1);
    expect(seek(span.end - 0.01, nodeOf("c")).dim ?? 0).toBe(0);
    expect(seek(span.end - 0.01, nodeOf("a")).dim ?? 0).toBe(1);
  });

  it("holds a dim in the scene's last beat through the scene's fade-out", () => {
    expect(dim(mid("four"), nodeOf("b"))).toBe(1);
    expect(dim(plan.duration, nodeOf("b"))).toBe(1);
    expect(dim(plan.duration, nodeOf("a"))).toBe(0);
  });
});

describe("buildBeats: a scene whose dims went semi-transparent", () => {
  const { graph: fixtureGraph, storyboard: fixtureBoard } = dimFocusFixture;
  const fixture = unwrap(parseGraph(fixtureGraph));
  const board = unwrap(parseStoryboard(fixtureBoard, fixture));
  const plan = buildBeats(board, fixture);
  const at = seeker(plan);
  const scene = board.scenes.find((s) => s.id === "backprop");
  if (!scene) throw new Error("no backprop scene");

  it("keeps bright, at each beat's middle, the nodes its dim keeps", () => {
    for (const beat of scene.beats) {
      const span = spanOf(plan.beats, beat.id);
      const t = (span.start + span.end) / 2;
      const focus = beat.actions.find((a) => a.type === "dim");
      const kept = focus?.type === "dim" ? focus.except : scene.nodes;
      for (const node of kept)
        expect(at(t, nodeTarget(scoped(scene.id, node))).dim ?? 0, `${beat.id}: ${node}`).toBe(0);
    }
  });

  it("has nothing faint in the beat that dims nothing", () => {
    const span = spanOf(plan.beats, "nudge");
    const t = (span.start + span.end) / 2;
    const scenePlan = spanOf(plan.scenes, "backprop");
    for (const node of scene.nodes)
      expect(at(t, nodeTarget(scoped(scene.id, node))).dim ?? 0, node).toBe(0);
    for (const edge of scenePlan.edges)
      expect(at(t, edgeTarget(scoped(scene.id, edge))).dim ?? 0, edge).toBe(0);
  });
});
