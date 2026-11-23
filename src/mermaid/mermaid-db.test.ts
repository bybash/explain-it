import { describe, expect, it } from "vitest";
import { fromMermaidDb } from "./mermaid-db.ts";

describe("fromMermaidDb", () => {
  it("reads Mermaid's flowchart database as a plain diagram, entity codes decoded", () => {
    expect(
      fromMermaidDb({
        type: "flowchart-v2",
        title: "",
        vertices: [
          {
            id: "a",
            text: "x ﬂ°quot¶ßyﬂ°quot¶ß ﬂ°lt¶ßbﬂ°gt¶ß ﬂ°°124¶ß ﬂ°°96¶ß ﬂ°°35¶ß ﬂ°amp¶ß z<br>w",
            type: "stadium",
          },
          { id: "b", text: "B", type: "square" },
          { id: "c", text: "c", type: null },
        ],
        edges: [
          {
            id: "e1",
            start: "a",
            end: "b",
            text: "go",
            type: "arrow_point",
            stroke: "normal",
            isUserDefinedId: true,
          },
          {
            id: "L_a_b_0",
            start: "a",
            end: "b",
            text: "",
            type: "arrow_point",
            stroke: "dotted",
            isUserDefinedId: false,
          },
        ],
        subgraphs: [{ id: "zone", title: "Zone", nodes: ["b"] }],
      }),
    ).toEqual({
      type: "flowchart",
      nodes: [
        { id: "a", label: 'x "y" <b> | ` # & z\nw', shape: "stadium" },
        { id: "b", label: "B", shape: "square" },
        { id: "c", label: "c", shape: null },
      ],
      edges: [
        { id: "e1", from: "a", to: "b", label: "go", arrow: "plain" },
        { from: "a", to: "b", arrow: "dotted" },
      ],
      subgraphs: [{ id: "zone", title: "Zone", members: ["b"] }],
    });
  });

  it("names every kind of link Mermaid draws", () => {
    const arrows = [
      ["arrow_point", "normal"],
      ["arrow_point", "thick"],
      ["arrow_open", "invisible"],
      ["arrow_open", "normal"],
      ["arrow_cross", "normal"],
      ["arrow_circle", "normal"],
      ["double_arrow_point", "normal"],
      ["double_arrow_circle", "normal"],
    ].map(
      ([type = "", stroke = ""]) =>
        fromMermaidDb({
          type: "flowchart-v2",
          vertices: [],
          subgraphs: [],
          edges: [
            { id: "x", start: "a", end: "b", text: "", type, stroke, isUserDefinedId: false },
          ],
        }).edges[0]?.arrow,
    );
    expect(arrows).toEqual([
      "plain",
      "thick",
      "invisible",
      "open",
      "cross",
      "circle",
      "both",
      "both",
    ]);
  });

  it("keeps the diagram title, and names other diagram types plainly", () => {
    const empty = { vertices: [], edges: [], subgraphs: [] };
    expect(fromMermaidDb({ type: "flowchart-v2", title: "OAuth", ...empty }).title).toBe("OAuth");
    expect(fromMermaidDb({ type: "sequence", ...empty }).type).toBe("sequence");
  });
});
