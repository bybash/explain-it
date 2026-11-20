import { describe, expect, it } from "vitest";
import { formatErrors } from "../../schema/errors.ts";
import { type Graph, type GraphNode, NODE_KINDS } from "../../schema/graph.ts";
import { project } from "./project.ts";
import { buildScene, type Positions, type Scene } from "./scene.ts";

const view = { scale: 40, originX: 960, originY: 200 };

const graphOf = (nodes: GraphNode[], zones: Graph["zones"] = []): Graph => ({
  version: 1,
  title: "Test",
  nodes,
  edges: [],
  zones,
});

const node = (id: string, kind: GraphNode["kind"] = "service", zone?: string): GraphNode =>
  zone === undefined ? { id, label: id, kind } : { id, label: id, kind, zone };

const sceneOf = (graph: Graph, positions: Positions): Scene => {
  const result = buildScene(graph, positions, view);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.value;
};

const at = (x: number, y: number, z: number) => project({ x, y, z }, view);

describe("buildScene: nodes", () => {
  it("draws a box as its top, left and right faces at the node's position", () => {
    const scene = sceneOf(graphOf([node("app")]), { app: { x: 2, y: 3 } });
    const [app] = scene.nodes;
    if (!app) throw new Error("no node");
    const { x, y, w, d, h } = app.box;
    expect([x, y]).toEqual([2, 3]);
    expect(app.faces.top).toEqual([
      at(x, y, h),
      at(x + w, y, h),
      at(x + w, y + d, h),
      at(x, y + d, h),
    ]);
    expect(app.faces.left).toEqual([
      at(x, y + d, h),
      at(x + w, y + d, h),
      at(x + w, y + d, 0),
      at(x, y + d, 0),
    ]);
    expect(app.faces.right).toEqual([
      at(x + w, y, h),
      at(x + w, y + d, h),
      at(x + w, y + d, 0),
      at(x + w, y, 0),
    ]);
  });

  it("sizes boxes by kind: databases stand taller, queues are low and long", () => {
    const graph = graphOf(NODE_KINDS.map((kind, i) => node(`n${i}`, kind)));
    const positions = Object.fromEntries(NODE_KINDS.map((_, i) => [`n${i}`, { x: i * 5, y: 0 }]));
    const boxes = new Map(sceneOf(graph, positions).nodes.map((n) => [n.kind, n.box]));
    for (const box of boxes.values()) {
      expect(Math.min(box.w, box.d, box.h)).toBeGreaterThan(0);
    }
    const service = boxes.get("service");
    const database = boxes.get("database");
    const queue = boxes.get("queue");
    if (!service || !database || !queue) throw new Error("missing kinds");
    expect(database.h).toBeGreaterThan(service.h);
    expect(queue.h).toBeLessThan(service.h);
    expect(queue.w).toBeGreaterThan(queue.d * 1.5);
  });
});

describe("buildScene: depth order", () => {
  const order = (graph: Graph, positions: Positions) =>
    sceneOf(graph, positions).nodes.map((n) => n.id);

  it("draws a box behind along x first, whatever the graph order", () => {
    const graph = graphOf([node("front"), node("back")]);
    expect(order(graph, { front: { x: 5, y: 0 }, back: { x: 0, y: 0 } })).toEqual([
      "back",
      "front",
    ]);
  });

  it("draws a box behind along y first", () => {
    const graph = graphOf([node("front"), node("back")]);
    expect(order(graph, { front: { x: 0, y: 4 }, back: { x: 1, y: 0 } })).toEqual([
      "back",
      "front",
    ]);
  });

  it("orders boxes that overlap along x by their y separation", () => {
    // The footprints overlap along x, so only y decides: the actor is in front.
    const graph = graphOf([node("actor", "actor"), node("queue", "queue")]);
    expect(order(graph, { actor: { x: 0, y: 1.6 }, queue: { x: -1, y: 0 } })).toEqual([
      "queue",
      "actor",
    ]);
  });

  it("orders a chain listed backwards", () => {
    const graph = graphOf([node("c"), node("b"), node("a")]);
    const positions = { a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, c: { x: 4, y: 4 } };
    expect(order(graph, positions)).toEqual(["a", "b", "c"]);
  });
});

describe("buildScene: errors", () => {
  it("names nodes without a position and positions without a node", () => {
    const result = buildScene(
      graphOf([node("app"), node("db", "database")]),
      {
        app: { x: 0, y: 0 },
        cache: { x: 4, y: 0 },
      },
      view,
    );
    expect(result.ok ? [] : formatErrors(result.errors)).toEqual([
      'positions.db: missing position for node "db"',
      'positions.cache: unknown node "cache"',
    ]);
  });
});

describe("buildScene: zones", () => {
  const graph = graphOf(
    [node("app", "service", "backend"), node("db", "database", "backend"), node("user", "actor")],
    [
      { id: "backend", label: "Backend" },
      { id: "empty", label: "Empty" },
    ],
  );
  const scene = sceneOf(graph, { app: { x: 0, y: 0 }, db: { x: 5, y: 1 }, user: { x: 0, y: 8 } });

  it("draws a flat platform enclosing its members with an even margin", () => {
    const [backend] = scene.zones;
    if (!backend) throw new Error("no zone");
    const members = scene.nodes.filter((n) => n.id === "app" || n.id === "db").map((n) => n.box);
    const { x, y, w, d } = backend.rect;
    const margins = [
      Math.min(...members.map((b) => b.x)) - x,
      Math.min(...members.map((b) => b.y)) - y,
      x + w - Math.max(...members.map((b) => b.x + b.w)),
      y + d - Math.max(...members.map((b) => b.y + b.d)),
    ];
    expect(margins[0]).toBeGreaterThan(0);
    for (const margin of margins) expect(margin).toBeCloseTo(margins[0] ?? 0, 10);
    expect(backend.polygon).toEqual([
      at(x, y, 0),
      at(x + w, y, 0),
      at(x + w, y + d, 0),
      at(x, y + d, 0),
    ]);
    expect(backend.label).toBe("Backend");
  });

  it("leaves out zones with no members", () => {
    expect(scene.zones.map((zone) => zone.id)).toEqual(["backend"]);
  });
});

describe("buildScene: floor", () => {
  const scene = sceneOf(graphOf([node("a"), node("b")]), { a: { x: 0, y: 0 }, b: { x: 6, y: 3 } });

  it("places dots on a half-unit grid on the floor, major on whole units", () => {
    expect(scene.floor.length).toBeGreaterThan(0);
    for (const dot of scene.floor) {
      expect(Number.isInteger(dot.grid.x * 2) && Number.isInteger(dot.grid.y * 2)).toBe(true);
      expect(dot.major).toBe(Number.isInteger(dot.grid.x) && Number.isInteger(dot.grid.y));
      expect(dot.at).toEqual(at(dot.grid.x, dot.grid.y, 0));
    }
  });

  it("reaches beyond every node", () => {
    const xs = scene.floor.map((dot) => dot.grid.x);
    const ys = scene.floor.map((dot) => dot.grid.y);
    for (const { box } of scene.nodes) {
      expect(Math.min(...xs)).toBeLessThan(box.x);
      expect(Math.min(...ys)).toBeLessThan(box.y);
      expect(Math.max(...xs)).toBeGreaterThan(box.x + box.w);
      expect(Math.max(...ys)).toBeGreaterThan(box.y + box.d);
    }
  });

  it("fades from the middle to nothing at the corners", () => {
    const opacities = scene.floor.map((dot) => dot.opacity);
    expect(Math.min(...opacities)).toBe(0);
    expect(Math.max(...opacities)).toBeGreaterThan(0.8);
    expect(Math.max(...opacities)).toBeLessThanOrEqual(1);
  });
});

describe("buildScene: top face", () => {
  it("gives a transform that lays local content flat on the box top", () => {
    const [app] = sceneOf(graphOf([node("app")]), { app: { x: 2, y: 1 } }).nodes;
    if (!app) throw new Error("no node");
    const { x, y, w, d, h } = app.box;
    const { width, depth, transform } = app.topContent;
    const [a, b, c, dd, e, f] = transform;
    const apply = (u: number, v: number) => ({ x: a * u + c * v + e, y: b * u + dd * v + f });
    const close = (p: { x: number; y: number }, q: { x: number; y: number }) => {
      expect(p.x).toBeCloseTo(q.x, 9);
      expect(p.y).toBeCloseTo(q.y, 9);
    };
    close(apply(0, 0), at(x, y, h));
    close(apply(width, 0), at(x + w, y, h));
    close(apply(width, depth), at(x + w, y + d, h));
    close(apply(0, depth), at(x, y + d, h));
  });
});

describe("buildScene: style", () => {
  const styleOf = (graph: Graph, positions: Positions) =>
    sceneOf(graph, positions).nodes.map(({ id, category, icon }) => ({ id, category, icon }));

  it("gives a node without a category or icon its kind's", () => {
    const graph = graphOf([node("user", "actor"), node("db", "database")]);
    expect(styleOf(graph, { user: { x: 0, y: 0 }, db: { x: 5, y: 0 } })).toEqual([
      { id: "user", category: "c1", icon: "user" },
      { id: "db", category: "c2", icon: "database" },
    ]);
  });

  it("gives every kind a category and an icon", () => {
    const graph = graphOf(NODE_KINDS.map((kind, i) => node(`n${i}`, kind)));
    const positions = Object.fromEntries(NODE_KINDS.map((_, i) => [`n${i}`, { x: i * 5, y: 0 }]));
    for (const style of styleOf(graph, positions)) {
      expect(style.category).toMatch(/^[a-z]/);
      expect(style.icon).toMatch(/^[a-z]/);
    }
  });

  it("keeps a node's own category and icon", () => {
    const graph = graphOf([{ ...node("app"), category: "c4", icon: "rocket" }]);
    expect(styleOf(graph, { app: { x: 0, y: 0 } })).toEqual([
      { id: "app", category: "c4", icon: "rocket" },
    ]);
  });

  it("colours a zone with the accent unless it names a category", () => {
    const graph = graphOf(
      [node("a", "service", "plain"), node("b", "service", "named")],
      [
        { id: "plain", label: "Plain" },
        { id: "named", label: "Named", category: "c3" },
      ],
    );
    const zones = sceneOf(graph, { a: { x: 0, y: 0 }, b: { x: 8, y: 0 } }).zones;
    expect(zones.map(({ id, category }) => ({ id, category }))).toEqual([
      { id: "plain", category: "accent" },
      { id: "named", category: "c3" },
    ]);
  });
});
