import { useEffect, useRef, useState } from "react";
import { fitZoom, type Size } from "./diagram-zoom.ts";

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
      // Drawn at its own size, which the view then zooms.
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

/** How much larger than its own size a small diagram is drawn when it is fitted. */
const FIT_LARGEST = 1.25;

/**
 * The diagram the Mermaid code draws (SPEC, Mermaid: rendered on the
 * client), fitted to its box or at `zoom`; the last good drawing stays while
 * the code cannot be drawn. `onZoom` is told the zoom it is shown at, so
 * controls can go on from a fitted one.
 */
export const MermaidDiagram = ({
  text,
  label,
  className = "",
  zoom = "fit",
  fitLargest = FIT_LARGEST,
  onZoom,
}: {
  text: string;
  label: string;
  className?: string;
  zoom?: number | "fit";
  /** The largest a fitted drawing may get, times its own size. */
  fitLargest?: number;
  onZoom?: (shown: number) => void;
}) => {
  const frame = useRef<HTMLElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [problem, setProblem] = useState<string | undefined>();
  /** The drawing's own size, and the room it has. */
  const [drawing, setDrawing] = useState<Size>({ width: 0, height: 0 });
  const [room, setRoom] = useState<Size>({ width: 0, height: 0 });

  useEffect(() => {
    let current = true;
    void loadMermaid().then(
      (mermaid) =>
        mermaid.render(`mermaid-diagram-${++drawn}`, text).then(
          ({ svg }) => {
            if (!current || !box.current) return;
            // The SVG comes from Mermaid's strict mode, which sanitises the labels.
            box.current.innerHTML = svg;
            const view = box.current.querySelector("svg")?.viewBox.baseVal;
            setDrawing({ width: view?.width ?? 0, height: view?.height ?? 0 });
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

  // The room changes with the window and the layout, and from nothing when the box is first shown.
  useEffect(() => {
    if (!frame.current) return;
    const watch = new ResizeObserver(([entry]) => {
      if (entry) setRoom({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    watch.observe(frame.current);
    return () => watch.disconnect();
  }, []);

  const shown = zoom === "fit" ? fitZoom(drawing, room, fitLargest) : zoom;
  useEffect(() => onZoom?.(shown), [onZoom, shown]);
  useEffect(() => {
    const svg = box.current?.querySelector("svg");
    if (!svg || drawing.width === 0) return;
    // Whole pixels, so a fitted drawing never overflows its box by a rounding.
    svg.style.width = `${Math.floor(drawing.width * shown)}px`;
    svg.style.height = `${Math.floor(drawing.height * shown)}px`;
  }, [drawing, shown]);

  return (
    <figure
      ref={frame}
      className={`flex overflow-auto rounded-box border border-line bg-surface p-3 ${className}`}
      aria-label={label}
    >
      {/* Stays in view while a wide diagram scrolls under it. */}
      {problem && (
        <figcaption className="sticky top-0 left-0 h-0 w-0 whitespace-nowrap text-muted text-sm">
          {problem}
        </figcaption>
      )}
      {/* Centred while it fits; auto margins keep every side reachable by scrolling when it does not. */}
      <div
        className="m-auto data-[stale=true]:opacity-40 [&_svg]:max-w-none"
        ref={box}
        data-stale={problem !== undefined}
      />
    </figure>
  );
};
