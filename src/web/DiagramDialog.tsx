import { useEffect, useRef, useState } from "react";
import { zoomStep } from "./diagram-zoom.ts";
import { CloseIcon, FitIcon, ZoomInIcon, ZoomOutIcon } from "./icons.tsx";
import { MermaidDiagram } from "./MermaidDiagram.tsx";
import { IconButton } from "./ui.tsx";

/**
 * The graph's diagram over the whole screen, fitted to it, to zoom and
 * scroll. A modal dialog: Esc or Close leaves it, and the focus goes back to
 * the button that opened it.
 */
export const DiagramDialog = ({ text, close }: { text: string; close: () => void }) => {
  const dialog = useRef<HTMLDialogElement>(null);
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [shown, setShown] = useState(1);
  useEffect(() => {
    // Opened once: React's development mode runs this twice. Nothing closes it on the way out, as
    // its `close` event is the user's, and the page drops a dialog that is taken out of it.
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      onClose={close}
      aria-label="The graph, full screen"
      className="fixed inset-0 m-0 h-dvh max-h-none w-dvw max-w-none bg-page p-4 text-ink"
    >
      <div className="flex h-full flex-col gap-3">
        <div className="flex items-center justify-end gap-2">
          <span className="mr-auto font-bold">The graph</span>
          <span className="text-muted text-sm tabular-nums">{Math.round(shown * 100)}%</span>
          <IconButton label="Zoom out" onClick={() => setZoom(zoomStep(shown, -1))}>
            <ZoomOutIcon />
          </IconButton>
          <IconButton label="Zoom in" onClick={() => setZoom(zoomStep(shown, 1))}>
            <ZoomInIcon />
          </IconButton>
          <IconButton label="Fit to the screen" onClick={() => setZoom("fit")}>
            <FitIcon />
          </IconButton>
          <IconButton label="Close" onClick={() => dialog.current?.close()}>
            <CloseIcon />
          </IconButton>
        </div>
        <MermaidDiagram
          text={text}
          label="The graph as a diagram, full screen"
          className="min-h-0 flex-1"
          zoom={zoom}
          fitLargest={2}
          onZoom={setShown}
        />
      </div>
    </dialog>
  );
};
