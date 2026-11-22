import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { NodeShape } from "../iso/scene.ts";
import { BADGE_LIFT, badgeAnchor, CALLOUT_GAP, placeBadge, placeCallout } from "./place.ts";
import type { Rect } from "./regions.ts";

/**
 * A box drawn the way the projection draws one: a top diamond 200 wide and
 * 116 deep around (cx, cy), with side faces 60 tall under its front edges.
 */
const faces = (cx: number, cy: number): NodeShape["faces"] => {
  const back = { x: cx, y: cy - 58 };
  const right = { x: cx + 100, y: cy };
  const front = { x: cx, y: cy + 58 };
  const left = { x: cx - 100, y: cy };
  const down = (p: { x: number; y: number }) => ({ x: p.x, y: p.y + 60 });
  return {
    top: [back, right, front, left],
    left: [left, front, down(front), down(left)],
    right: [front, right, down(right), down(front)],
  };
};
const polygons = (f: NodeShape["faces"]) => [f.top, f.left, f.right];

const BOUNDS: Rect = { x: 0, y: 0, width: 1920, height: 1080 };
const CARD = { width: 320, height: 120 };
const insideBounds = (box: Rect) =>
  box.x >= BOUNDS.x &&
  box.y >= BOUNDS.y &&
  box.x + box.width <= BOUNDS.x + BOUNDS.width &&
  box.y + box.height <= BOUNDS.y + BOUNDS.height;

describe("placeCallout", () => {
  it("puts the card to the right of the node, level with its right corner", () => {
    const node = faces(800, 500);
    const placed = placeCallout(node, CARD, BOUNDS, polygons(node));
    expect(placed.side).toBe("right");
    expect(placed.anchor).toEqual({ x: 900, y: 500 });
    expect(placed.box).toEqual({ x: 900 + CALLOUT_GAP, y: 440, width: 320, height: 120 });
  });

  it("flips to the left when the right side runs out of the bounds", () => {
    const node = faces(1700, 500);
    const placed = placeCallout(node, CARD, BOUNDS, polygons(node));
    expect(placed.side).toBe("left");
    expect(placed.anchor).toEqual({ x: 1600, y: 500 });
    expect(placed.box.x + placed.box.width).toBe(1600 - CALLOUT_GAP);
  });

  it("goes to the left when the right side would cover another node", () => {
    const node = faces(800, 500);
    const neighbour = faces(1150, 500);
    const placed = placeCallout(node, CARD, BOUNDS, [...polygons(node), ...polygons(neighbour)]);
    expect(placed.side).toBe("left");
  });

  it("goes above when both sides are blocked", () => {
    const node = faces(800, 500);
    const placed = placeCallout(node, CARD, BOUNDS, [
      ...polygons(node),
      ...polygons(faces(1150, 500)),
      ...polygons(faces(450, 500)),
    ]);
    expect(placed.side).toBe("above");
    expect(placed.box.y + placed.box.height).toBe(442 - CALLOUT_GAP);
  });

  it("slides the card along a side to clear an obstacle before covering anything", () => {
    const node = faces(800, 500);
    const square = (x: number, y: number) => [
      { x, y },
      { x: x + 60, y },
      { x: x + 60, y: y + 60 },
      { x, y: y + 60 },
    ];
    const placed = placeCallout(node, CARD, BOUNDS, [
      ...polygons(node),
      ...polygons(faces(450, 500)),
      square(700, 350),
      square(700, 700),
      square(1000, 530),
    ]);
    expect(placed.side).toBe("right");
    expect(placed.box.y).toBeLessThan(440);
    expect(placed.pointer).toEqual({ x: 900 + CALLOUT_GAP, y: 500 });
  });

  it("stays inside the bounds even in a corner with no free side", () => {
    const node = faces(1820, 1000);
    const placed = placeCallout(node, CARD, BOUNDS, polygons(node));
    expect(insideBounds(placed.box)).toBe(true);
  });

  it("points from the card edge nearest the anchor", () => {
    const node = faces(800, 500);
    const placed = placeCallout(node, CARD, BOUNDS, polygons(node));
    expect(placed.pointer).toEqual({ x: 900 + CALLOUT_GAP, y: 500 });
  });
});

describe("badgeAnchor", () => {
  it("sits on the top face's back corner, centred over the node", () => {
    expect(badgeAnchor(faces(800, 500))).toEqual({ x: 800, y: 442 });
  });
});

describe("placeBadge", () => {
  const BADGE = { width: 90, height: 34 };

  it("stands centred on the anchor, lifted a little", () => {
    expect(placeBadge(faces(800, 500), BADGE, BOUNDS)).toEqual({
      x: 755,
      y: 442 - BADGE_LIFT - 34,
      width: 90,
      height: 34,
    });
  });

  it("stays inside the bounds on a node at the top edge", () => {
    const box = placeBadge(faces(800, 70), BADGE, BOUNDS);
    expect(box.y).toBe(0);
    expect(insideBounds(box)).toBe(true);
  });

  it("slides sideways off something already there, such as an edge's label", () => {
    // A label sitting exactly where the badge would go.
    const label = [
      { x: 750, y: 390 },
      { x: 850, y: 390 },
      { x: 850, y: 430 },
      { x: 750, y: 430 },
    ];
    const box = placeBadge(faces(800, 500), BADGE, BOUNDS, [label]);
    expect(box.y).toBe(442 - BADGE_LIFT - 34);
    expect(box.x + box.width <= 750 || box.x >= 850).toBe(true);
  });
});

describe("placeCallout: properties", () => {
  const point = fc.record({
    x: fc.double({ min: 0, max: 1920, noNaN: true }),
    y: fc.double({ min: 0, max: 1080, noNaN: true }),
  });

  it("always keeps the card inside the bounds, wherever the node and obstacles are", () => {
    fc.assert(
      fc.property(
        point,
        fc.record({
          width: fc.integer({ min: 40, max: 600 }),
          height: fc.integer({ min: 30, max: 400 }),
        }),
        fc.array(point, { maxLength: 8 }),
        (centre, card, others) => {
          const node = faces(centre.x, centre.y);
          const obstacles = [
            ...polygons(node),
            ...others.flatMap((o) => polygons(faces(o.x, o.y))),
          ];
          const placed = placeCallout(node, card, BOUNDS, obstacles);
          expect(insideBounds(placed.box)).toBe(true);
          expect(placed.box).toMatchObject(card);
        },
      ),
    );
  });
});
