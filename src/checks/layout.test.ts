import { describe, expect, it } from "vitest";
import type { Shape } from "../schema/checks.ts";
import { layoutWarnings, SAFE_AREA } from "./layout.ts";

const rect = (x: number, y: number, w: number, h: number) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
const where = { scene: "intro", beat: "start", at: 2.5 };
const node = (id: string, x: number, y: number, zone?: string): Shape => ({
  kind: "node",
  id,
  ...(zone ? { zone } : {}),
  faces: [rect(x, y, 200, 120)],
});
const messages = (shapes: Shape[]) => layoutWarnings(shapes, where).map((w) => w.message);

describe("layoutWarnings: overlaps", () => {
  it("names two boxes on top of each other, with the depth", () => {
    const warnings = layoutWarnings([node("app", 500, 400), node("idp", 650, 400)], where);
    expect(warnings).toEqual([
      {
        check: "overlap",
        ...where,
        px: 50,
        // For a fix to lay them out again.
        nodes: ["app", "idp"],
        message: 'node "app" and node "idp" overlap by 50 px',
      },
    ]);
  });

  it("lets shapes come within 4 px of each other", () => {
    expect(messages([node("app", 500, 400), node("idp", 697, 400)])).toEqual([]);
  });

  it("finds a node moved onto a zone it is not in, and not one on its own zone", () => {
    const zone: Shape = { kind: "zone", id: "server", polygon: rect(400, 300, 500, 400) };
    expect(messages([zone, node("api", 450, 350, "server")])).toEqual([]);
    expect(messages([zone, node("user", 450, 350)])).toEqual([
      'node "user" sits on zone "server", which it is not in, by 120 px',
    ]);
  });

  it("finds a zone's label covered by a node", () => {
    const label: Shape = { kind: "zone-label", zone: "server", polygon: rect(420, 300, 160, 24) };
    expect(messages([label, node("run", 450, 310, "server")])).toEqual([
      'zone "server"\'s label is covered by node "run" by 14 px',
    ]);
  });

  it("finds an edge through a node it does not connect", () => {
    const edge: Shape = {
      kind: "edge",
      id: "send",
      from: "a",
      to: "c",
      points: [
        { x: 300, y: 460 },
        { x: 1200, y: 460 },
      ],
    };
    expect(
      messages([edge, node("a", 100, 400), node("b", 500, 400), node("c", 1200, 400)]),
    ).toEqual(['edge "send" runs through node "b" for 200 px']);
  });

  it("finds overlays covering nodes or each other, but not a callout on its own node", () => {
    const callout: Shape = {
      kind: "overlay",
      role: "callout",
      node: "idp",
      polygon: rect(560, 380, 200, 80),
    };
    const badge: Shape = {
      kind: "overlay",
      role: "badge",
      node: "app",
      polygon: rect(560, 380, 60, 30),
    };
    expect(messages([node("idp", 500, 400), callout])).toEqual([]);
    expect(messages([node("idp", 500, 400), callout, badge])).toEqual([
      'badge on "app" covers node "idp" by 10 px',
      'callout on "idp" and badge on "app" overlap by 30 px',
    ]);
  });
});

describe("layoutWarnings: off frame", () => {
  it("is the 1920 × 1080 stage less a 5 % margin", () => {
    expect(SAFE_AREA).toEqual({ x: 96, y: 54, width: 1728, height: 972 });
  });

  it("names anything that leaves the safe area, and by how much", () => {
    const caption: Shape = { kind: "overlay", role: "step", polygon: rect(60, 100, 400, 40) };
    expect(messages([node("app", 1700, 400), caption])).toEqual([
      'node "app" leaves the safe area by 76 px',
      "the step caption leaves the safe area by 36 px",
    ]);
  });
});
