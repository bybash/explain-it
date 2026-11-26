import { useCallback, useEffect, useRef, useState } from "react";
import { graphToMermaid } from "../mermaid/generate.ts";
import type { GraphSaveOutcome, OpenedProject } from "../schema/api.ts";
import type { ValidationError } from "../schema/errors.ts";
import { readGraph, saveGraph } from "./api.ts";
import { Errors } from "./Errors.tsx";
import { editorState, errorLine, onDisk, STARTER_MERMAID } from "./graph-editor.ts";
import { counted } from "./labels.ts";
import { MermaidDiagram } from "./MermaidDiagram.tsx";
import { MermaidEditor } from "./MermaidEditor.tsx";

/** What the graph leaves out or warns of, as a list under the code. */
const NOTES_CLASS = "mt-2 list-disc pl-5 text-muted text-sm";

/** How long typing pauses before the code is read and drawn again. */
const PAUSE_MS = 400;

type Read =
  | { readonly ok: true; readonly notes: readonly string[] }
  | { readonly ok: false; readonly errors: readonly ValidationError[] };

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
  /** The text that matches the graph on disk, as far as this editor knows. */
  const [base, setBase] = useState(saved);
  const [shown, setShown] = useState(text);
  const [read, setRead] = useState<Read | undefined>();
  const [outcome, setOutcome] = useState<GraphSaveOutcome | undefined>();
  const [saveErrors, setSaveErrors] = useState<readonly ValidationError[]>([]);
  const [saving, setSaving] = useState(false);
  /** The graph was saved elsewhere (the assistant, MCP, another tab) while this editor had edits. */
  const [elsewhere, setElsewhere] = useState(false);
  const reads = useRef(0);
  /** The graph on disk this editor last took or wrote, as generated Mermaid. */
  const synced = useRef(saved);

  const state = editorState({ text, saved: base, read });

  /** Shows the graph on disk in place of what is here. */
  const take = useCallback((graph: string) => {
    synced.current = graph;
    setText(graph);
    setBase(graph);
    setOutcome(undefined);
    setSaveErrors([]);
    setElsewhere(false);
  }, []);

  useEffect(() => {
    const what = onDisk({ saved, synced: synced.current, edited: state.edited, saving });
    if (what === "take" && saved !== undefined) take(saved);
    else setElsewhere(what === "flag");
  }, [saved, state.edited, saving, take]);

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
    const sent = text;
    setSaving(true);
    const result = await saveGraph(slug, sent);
    setSaving(false);
    if (!result.ok) return setSaveErrors(result.errors);
    setSaveErrors([]);
    const { mermaid, staleBeats, storyboardProblems, warnings } = result.value;
    // The text stays as the user wrote it, comments and all: it is what was saved. Anything
    // typed while the save was on its way is still an edit.
    synced.current = mermaid;
    setBase(sent);
    setElsewhere(false);
    setOutcome({ staleBeats, storyboardProblems, warnings });
  };

  return (
    <div className="mt-3 mb-2">
      <div className="grid grid-cols-[1fr] items-start gap-4 min-[1101px]:grid-cols-2">
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
            <ul className={NOTES_CLASS} aria-label="Left out of the graph">
              {read.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
        </div>
        <MermaidDiagram text={shown} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button className="btn" type="button" onClick={save} disabled={!state.canSave || saving}>
          Save the graph
        </button>
        {state.unsaved && <span className="font-semibold text-accent">Unsaved changes</span>}
        {elsewhere && state.unsaved && (
          <span className="text-muted">
            The graph was changed elsewhere; saving replaces it.{" "}
            <button
              type="button"
              className="underline hover:text-ink"
              onClick={() => saved !== undefined && take(saved)}
            >
              Show the saved graph instead
            </button>
          </span>
        )}
        {outcome && !state.unsaved && (
          <span className="text-muted" role="status">
            Saved.
            {outcome.staleBeats.length > 0 &&
              ` ${counted(outcome.staleBeats.length, "beat")} to rewrite at the script gate.`}
          </span>
        )}
      </div>
      <Errors errors={saveErrors} />
      {outcome && [...outcome.storyboardProblems, ...outcome.warnings].length > 0 && (
        <ul className={NOTES_CLASS}>
          {[...outcome.storyboardProblems, ...outcome.warnings].map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
};
