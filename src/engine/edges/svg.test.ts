// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import type { View } from "../iso/project.ts";
import { edgeTarget } from "./flow.ts";
import { edgeGeometry } from "./geometry.ts";
import { renderEdges } from "./svg.ts";

const SVG_NS = "http://www.w3.org/2000/svg";
const view: View = { scale: 10, originX: 100, originY: 50 };

beforeAll(() => {
  // jsdom lays nothing out; a label measures as a fixed box, as a font would give it.
  Object.defineProperty(window.SVGElement.prototype, "getBBox", {
    configurable: true,
    value: () => ({ x: 0, y: 0, width: 60, height: 14 }),
  });
});

/** One labelled edge, drawn into a fresh stage; returns its markup and the function that poses it. */
const stage = () => {
  const svg = document.createElementNS(SVG_NS, "svg");
  const lines = document.createElementNS(SVG_NS, "g") as SVGGElement;
  const labels = document.createElementNS(SVG_NS, "g") as SVGGElement;
  svg.append(lines, labels);
  const geometry = edgeGeometry(
    [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
    ],
    view,
    [],
  );
  const pose = renderEdges({ lines, labels }, [
    { id: "login", geometry, label: "GET /login", category: "c1" },
  ]);
  return { pose, markup: () => svg.innerHTML };
};

const target = edgeTarget("login");

describe("renderEdges", () => {
  it("draws a hidden edge the same however the player got there", () => {
    const seeked = stage();
    // Played to the end, then sought back to before the edge draws in.
    seeked.pose({
      [target]: { draw: 1, dash: 37, dot: 0.6, dotOpacity: 1, label: 1, dim: 1 },
    });
    seeked.pose({});
    const fresh = stage();
    fresh.pose({});
    expect(seeked.markup()).toBe(fresh.markup());
  });

  it("draws a half-drawn edge the same after a later moment as straight away", () => {
    const later = { [target]: { draw: 1, dash: 37, dot: 0.6, dotOpacity: 1, label: 1 } };
    const half = { [target]: { draw: 0.5, dash: 4 } };
    const seeked = stage();
    seeked.pose(later);
    seeked.pose(half);
    const fresh = stage();
    fresh.pose(half);
    expect(seeked.markup()).toBe(fresh.markup());
  });
});
