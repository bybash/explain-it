import { useEffect, useRef, useState } from "react";
import type { OpenedProject } from "../schema/api.ts";
import { BriefPanel } from "./BriefPanel.tsx";
import { ScriptPanel } from "./ScriptPanel.tsx";

/**
 * The Script gate's panel: the story brief, then the script. Each holds its
 * own unsaved changes; the gate is held while either has some. A `beat`
 * from the address (the chat links to one) is brought into sight, its
 * caption ready to edit.
 */
export const ScriptGate = ({
  opened,
  beat,
  blocked,
}: {
  opened: OpenedProject;
  beat?: string | undefined;
  blocked: (reason: string | undefined) => void;
}) => {
  const gate = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (beat === undefined) return;
    // After the panel is shown, so the beat has a place to scroll to.
    const frame = requestAnimationFrame(() => {
      const card = gate.current?.querySelector<HTMLElement>(`li[data-beat="${CSS.escape(beat)}"]`);
      card?.scrollIntoView({ block: "center" });
      card?.querySelector<HTMLElement>("input, textarea")?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [beat]);
  const [brief, setBrief] = useState<string | undefined>();
  const [script, setScript] = useState<string | undefined>();
  useEffect(() => blocked(brief ?? script), [blocked, brief, script]);
  return (
    <div className="flex flex-col gap-6" ref={gate}>
      <BriefPanel opened={opened} blocked={setBrief} />
      <ScriptPanel opened={opened} blocked={setScript} />
    </div>
  );
};
