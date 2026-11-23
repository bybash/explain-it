import { useEffect, useRef, useState } from "react";

type Mermaid = typeof import("mermaid")["default"];
let loading: Promise<Mermaid> | undefined;

/** Mermaid, loaded the first time a diagram is drawn: it is large, and only the graph gate needs it. */
const loadMermaid = () => {
  loading ??= import("mermaid").then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      // Labels are the user's own text: strict keeps scripts and links out of the drawing.
      securityLevel: "strict",
      theme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "default",
    });
    return mermaid;
  });
  return loading;
};

let drawn = 0;

/** The diagram the Mermaid code draws (SPEC, Mermaid: rendered on the client); the last good drawing stays while the code cannot be drawn. */
export const MermaidDiagram = ({ text }: { text: string }) => {
  const box = useRef<HTMLDivElement>(null);
  const [problem, setProblem] = useState<string | undefined>();

  useEffect(() => {
    let current = true;
    void loadMermaid()
      .then((mermaid) => mermaid.render(`mermaid-diagram-${++drawn}`, text))
      .then(({ svg }) => {
        if (!current || !box.current) return;
        // The SVG comes from Mermaid's strict mode, which sanitises the labels.
        box.current.innerHTML = svg;
        setProblem(undefined);
      })
      .catch(() => {
        if (current) setProblem("The diagram cannot be drawn until the code reads.");
      });
    return () => {
      current = false;
    };
  }, [text]);

  return (
    <figure className="mermaid-diagram" aria-label="The graph as a diagram">
      <div ref={box} data-stale={problem !== undefined} />
      {problem && <figcaption className="muted">{problem}</figcaption>}
    </figure>
  );
};
