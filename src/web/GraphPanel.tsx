import { useEffect, useRef, useState } from "react";
import { graphToMermaid } from "../mermaid/generate.ts";
import type { OpenedProject } from "../schema/api.ts";
import type { ValidationError } from "../schema/errors.ts";
import { readGraph, saveGraph } from "./api.ts";
import { Errors } from "./Errors.tsx";
import { editorState, errorLine, STARTER_MERMAID } from "./graph-editor.ts";
import { MermaidDiagram } from "./MermaidDiagram.tsx";
import { MermaidEditor } from "./MermaidEditor.tsx";

/** How long typing pauses before the code is read and drawn again. */
const PAUSE_MS = 400;

type Read =
  | { readonly ok: true; readonly notes: readonly string[] }
  | { readonly ok: false; readonly errors: readonly ValidationError[] };

/** What the last save did to the rest of the project. */
type Saved = {
  readonly staleBeats: readonly string[];
  readonly storyboardProblems: readonly string[];
  readonly warnings: readonly string[];
};

/**
 * The graph gate's panel (SPEC, User flow): the graph as Mermaid code, the
 * diagram it draws, and Save. The code is read as the user types, so its
 * notes and errors show before saving; an error is marked on its line.
 * `blocked` says why the gate cannot be approved yet: there are unsaved edits.
 */
export const GraphPanel = ({
  opened,
  blocked,
}: {
  opened: OpenedProject;
  blocked: (reason: string | undefined) => void;
}) => {
  const { slug } = opened;
  const saved = opened.graph ? graphToMermaid(opened.graph) : undefined;
  const [text, setText] = useState(saved ?? STARTER_MERMAID);
  /** The saved Mermaid the edits started from. */
  const [base, setBase] = useState(saved);
  const [shown, setShown] = useState(text);
  const [read, setRead] = useState<Read | undefined>();
  const [outcome, setOutcome] = useState<Saved | undefined>();
  const [saveErrors, setSaveErrors] = useState<readonly ValidationError[]>([]);
  const [saving, setSaving] = useState(false);
  const reads = useRef(0);

  const state = editorState({ text, saved: base, read });

  // The graph changed elsewhere (MCP, another tab): follow it unless there are edits here.
  const changedElsewhere = saved !== undefined && saved !== base;
  useEffect(() => {
    if (changedElsewhere && !state.unsaved) {
      setText(saved);
      setBase(saved);
    }
  }, [changedElsewhere, state.unsaved, saved]);

  // Read and draw the code once typing pauses; an answer to older text is dropped.
  useEffect(() => {
    setRead(undefined);
    const timer = setTimeout(() => {
      setShown(text);
      const asked = ++reads.current;
      void readGraph(slug, text).then((result) => {
        if (asked !== reads.current) return;
        setRead(
          result.ok
            ? { ok: true, notes: result.value.notes }
            : { ok: false, errors: result.errors },
        );
      });
    }, PAUSE_MS);
    return () => clearTimeout(timer);
  }, [slug, text]);

  useEffect(() => {
    blocked(state.unsaved ? "Save the graph before approving it." : undefined);
  }, [blocked, state.unsaved]);

  const save = async () => {
    setSaving(true);
    const result = await saveGraph(slug, text);
    setSaving(false);
    if (!result.ok) return setSaveErrors(result.errors);
    setSaveErrors([]);
    const { mermaid, staleBeats, storyboardProblems, warnings } = result.value;
    // The saved graph written again: the same graph, in the generator's own layout.
    setText(mermaid);
    setBase(mermaid);
    setOutcome({ staleBeats, storyboardProblems, warnings });
  };

  return (
    <div className="graph-panel">
      <div className="graph-columns">
        <div>
          <MermaidEditor
            value={text}
            onChange={(next) => {
              setText(next);
              setOutcome(undefined);
            }}
            errorLine={read && !read.ok ? errorLine(read.errors) : undefined}
            label="The graph as Mermaid code"
          />
          {read && !read.ok && <Errors errors={read.errors} />}
          {read?.ok && read.notes.length > 0 && (
            <ul className="notes" aria-label="Left out of the graph">
              {read.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
        </div>
        <MermaidDiagram text={shown} />
      </div>
      <div className="graph-actions">
        <button type="button" onClick={save} disabled={!state.canSave || saving}>
          Save the graph
        </button>
        {state.unsaved && <span className="unsaved">Unsaved changes</span>}
        {changedElsewhere && state.unsaved && (
          <span className="muted">The graph was changed elsewhere; saving replaces it.</span>
        )}
        {outcome && !state.unsaved && (
          <span className="muted" role="status">
            Saved.
            {outcome.staleBeats.length > 0 &&
              ` ${outcome.staleBeats.length} beat${outcome.staleBeats.length === 1 ? "" : "s"} to rewrite at the script gate.`}
          </span>
        )}
      </div>
      <Errors errors={saveErrors} />
      {outcome && [...outcome.storyboardProblems, ...outcome.warnings].length > 0 && (
        <ul className="notes">
          {[...outcome.storyboardProblems, ...outcome.warnings].map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
};
