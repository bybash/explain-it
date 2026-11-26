import { useEffect, useState } from "react";
import type { OpenedProject } from "../schema/api.ts";
import { BriefPanel } from "./BriefPanel.tsx";
import { ScriptPanel } from "./ScriptPanel.tsx";

/**
 * The Script gate's panel: the story brief, then the script. Each holds its
 * own unsaved changes; the gate is held while either has some.
 */
export const ScriptGate = ({
  opened,
  blocked,
}: {
  opened: OpenedProject;
  blocked: (reason: string | undefined) => void;
}) => {
  const [brief, setBrief] = useState<string | undefined>();
  const [script, setScript] = useState<string | undefined>();
  useEffect(() => blocked(brief ?? script), [blocked, brief, script]);
  return (
    <div className="flex flex-col gap-6">
      <BriefPanel opened={opened} blocked={setBrief} />
      <ScriptPanel opened={opened} blocked={setScript} />
    </div>
  );
};
