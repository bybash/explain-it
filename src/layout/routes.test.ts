import { describe, expect, it } from "vitest";
import { withoutJogs } from "./routes.ts";

const box = (x: number, y: number, w = 2, d = 2) => ({ x, y, w, d });
const pts = (...xy: [number, number][]) => xy.map(([x, y]) => ({ x, y }));
const MIN = 0.5;

describe("withoutJogs", () => {
  it("lines up the run that does not end on a box, leaving the ends where they were", () => {
    const route = pts([2, 1], [4, 1], [4, 1.2], [6, 1.2], [6, 4]);
    expect(withoutJogs(route, box(0, 0), box(5, 4), MIN)).toEqual(pts([2, 1], [6, 1], [6, 4]));
  });

  it("slides an end along its box's side to make a straight line", () => {
    const route = pts([2, 1], [3, 1], [3, 1.2], [5, 1.2]);
    expect(withoutJogs(route, box(0, 0), box(5, 0), MIN)).toEqual(pts([2, 1], [5, 1]));
  });

  it("slides both ends to a line both boxes share when neither can move alone", () => {
    // Alone, each end would come within a quarter unit of its box's corner; together they
    // meet at y 1.75, the one line both sides allow.
    const route = pts([2, 1.5], [3, 1.5], [3, 1.9], [5, 1.9]);
    expect(withoutJogs(route, box(0, 0), box(5, 1.5), MIN)).toEqual(pts([2, 1.75], [5, 1.75]));
  });

  it("keeps a jog when straightening it would slide an end off its box", () => {
    const route = pts([2, 1.9], [3, 1.9], [3, 2.1], [5, 2.1]);
    expect(withoutJogs(route, box(0, 0), box(5, 2), MIN)).toEqual(route);
  });

  it("does not shorten the stub into a box below the minimum", () => {
    // Moving the middle run up to y 1.2 would leave a 0.1 stub into the target, so the
    // first run moves down instead, sliding its end along the source's side.
    const route = pts([2, 1.2], [4, 1.2], [4, 1], [6, 1], [6, 1.3]);
    expect(withoutJogs(route, box(0, 0), box(5, 1.3), MIN)).toEqual(pts([2, 1], [6, 1], [6, 1.3]));
  });

  it("does not move a run into another box", () => {
    // Moving the middle run down to y 1 would cross the box at x 5 to 6.
    const route = pts([2, 1], [4, 1], [4, 1.2], [8, 1.2], [8, 4]);
    const other = box(5, 0.2, 1, 0.85);
    expect(withoutJogs(route, box(0, 0), box(7, 4), MIN, [other])).toEqual(
      pts([2, 1.2], [8, 1.2], [8, 4]),
    );
  });
});
