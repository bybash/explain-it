import { describe, expect, it } from "vitest";
import { inSight, withoutJogs } from "./routes.ts";

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

describe("inSight", () => {
  const tall = (x: number, y: number, h: number) => ({ x, y, w: 2.8, d: 2.6, h });

  it("moves a run that passes behind a box out of the floor it hides", () => {
    // Behind `sessions` (y 6, height 1.4): the floor from y 4.6 to 6 is out of sight.
    const route = pts([24, 3.3], [26.2, 3.3], [26.2, 4.7], [32.8, 4.7], [32.8, 10.7], [15, 10.7]);
    const boxes = [tall(27, 6, 1.4), tall(27, 1, 0.9)];
    const moved = inSight(route, boxes);
    // Pulled back, clear of what the box hides, and still in front of the box behind it.
    expect(moved).toEqual(
      pts([24, 3.3], [26.2, 3.3], [26.2, 4.3], [32.8, 4.3], [32.8, 10.7], [15, 10.7]),
    );
  });

  it("moves a run in front of the box when there is no room behind it", () => {
    // Behind is a box reaching to y 3.9, too close to fit the run, so it goes in front instead.
    const route = pts([20, 3], [22, 3], [22, 4.9], [32, 4.9], [32, 12], [40, 12]);
    const boxes = [tall(27, 5.5, 1.4), tall(27, 1.3, 0.9)];
    expect(inSight(route, boxes)).toEqual(
      pts([20, 3], [22, 3], [22, 8.4], [32, 8.4], [32, 12], [40, 12]),
    );
  });

  it("moves an upright run the same way, along x", () => {
    const route = pts([10, 0], [10, 2], [25.5, 2], [25.5, 12], [30, 12]);
    expect(inSight(route, [tall(26, 6, 1.4)])).toEqual(
      pts([10, 0], [10, 2], [24.3, 2], [24.3, 12], [30, 12]),
    );
  });

  it("leaves a route in sight, and the runs that end on a box, as they are", () => {
    const route = pts([24, 3.3], [26.2, 3.3], [26.2, 4.0], [32.8, 4.0]);
    expect(inSight(route, [tall(27, 6, 1.4)])).toEqual(route);
  });
});
