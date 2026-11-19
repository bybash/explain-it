import { describe, expect, it } from "vitest";
import { timeline } from "../timeline.ts";
import { EDGE_TIMING, edgeTarget, flowTweens } from "./flow.ts";

const { draw, send } = EDGE_TIMING;
const START = 2;
const FLOW_FOR = 4;

const tl = flowTweens("login", { at: START, flowFor: FLOW_FOR })
  .reduce((builder, tween) => builder.add(tween), timeline())
  .build();
const edgeAt = (t: number) => tl.seek(t)[edgeTarget("login")] ?? {};

describe("flowTweens", () => {
  it("shows nothing of the edge before the flow starts", () => {
    expect(edgeAt(0)).toEqual({ draw: 0, label: 0, dot: 0, dotOpacity: 0, dash: 0 });
  });

  it("draws the edge in, then shows its label", () => {
    const halfway = edgeAt(START + draw / 2);
    expect(halfway.draw).toBeGreaterThan(0);
    expect(halfway.draw).toBeLessThan(1);
    expect(edgeAt(START + draw).draw).toBe(1);
    expect(edgeAt(START + draw + 1).label).toBe(1);
  });

  it("sends the dot along the drawn edge, and fades it out at the target", () => {
    const sending = edgeAt(START + draw + send / 2);
    expect(sending.draw).toBe(1);
    expect(sending.dotOpacity).toBe(1);
    expect(sending.dot).toBeGreaterThan(0.2);
    expect(sending.dot).toBeLessThan(0.8);
    const arrived = edgeAt(START + draw + send + 0.01);
    expect(arrived.dot).toBe(1);
    expect(arrived.dotOpacity).toBe(0);
  });

  it("flows the dashes at a steady speed for `flowFor` seconds after the draw-in, then stops", () => {
    const dashAt = (t: number) => edgeAt(t).dash ?? Number.NaN;
    const quarter = dashAt(START + draw + FLOW_FOR / 4);
    expect(quarter).toBeGreaterThan(0);
    expect(dashAt(START + draw + FLOW_FOR / 2)).toBeCloseTo(2 * quarter, 9);
    expect(dashAt(START + draw + FLOW_FOR)).toBeCloseTo(4 * quarter, 9);
    expect(dashAt(START + draw + FLOW_FOR + 1)).toBe(dashAt(START + draw + FLOW_FOR));
  });
});
