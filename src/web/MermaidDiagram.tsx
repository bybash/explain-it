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
      // Drawn at its own size and scrolled, so a wide graph stays readable instead of shrinking to fit.
      flowchart: { useMaxWidth: false },
      // A diagram that cannot be drawn is said above the last good one; Mermaid's own error drawing
      // would otherwise be left at the bottom of the page.
      suppressErrorRendering: true,
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
    void loadMermaid().then(
      (mermaid) =>
        mermaid.render(`mermaid-diagram-${++drawn}`, text).then(
          ({ svg }) => {
            if (!current || !box.current) return;
            // The SVG comes from Mermaid's strict mode, which sanitises the labels.
            box.current.innerHTML = svg;
            setProblem(undefined);
          },
          () => {
            if (current) setProblem("The diagram cannot be drawn until the code reads.");
          },
        ),
      () => {
        loading = undefined;
        if (current) setProblem("Mermaid could not be loaded, so the diagram cannot be drawn.");
      },
    );
    return () => {
      current = false;
    };
  }, [text]);

  return (
    <figure className="mermaid-diagram" aria-label="The graph as a diagram">
      {problem && <figcaption className="diagram-problem">{problem}</figcaption>}
      <div ref={box} data-stale={problem !== undefined} />
    </figure>
  );
};
