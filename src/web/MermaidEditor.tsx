import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { Annotation, EditorState, StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { useEffect, useRef } from "react";

/** A change made from outside (a new `value`), which is not the user's edit. */
const fromOutside = Annotation.define<boolean>();

/** Marks the line Mermaid could not read, or none. */
const setErrorLine = StateEffect.define<number | undefined>();

const errorLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(marks, transaction) {
    let next = marks.map(transaction.changes);
    for (const effect of transaction.effects)
      if (effect.is(setErrorLine)) {
        const n = effect.value;
        next =
          n === undefined || n < 1 || n > transaction.state.doc.lines
            ? Decoration.none
            : Decoration.set([
                Decoration.line({ class: "cm-error-line" }).range(
                  transaction.state.doc.line(n).from,
                ),
              ]);
      }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/**
 * The Mermaid code, in CodeMirror: line numbers, undo, Tab to indent, and the
 * line Mermaid could not read marked. `value` replaces the text when it
 * changes from outside, as after a save.
 */
export const MermaidEditor = ({
  value,
  onChange,
  errorLine,
  label,
}: {
  value: string;
  onChange: (text: string) => void;
  errorLine: number | undefined;
  label: string;
}) => {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | undefined>(undefined);
  const changed = useRef(onChange);
  changed.current = onChange;

  // biome-ignore lint/correctness/useExhaustiveDependencies: the editor is made once; later values arrive below.
  useEffect(() => {
    if (!host.current) return;
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          errorLineField,
          EditorView.contentAttributes.of({ "aria-label": label, spellcheck: "false" }),
          EditorView.updateListener.of((update) => {
            const theirs = update.transactions.some((t) => t.annotation(fromOutside));
            if (update.docChanged && !theirs) changed.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = undefined;
    };
  }, []);

  useEffect(() => {
    const editor = view.current;
    if (editor && editor.state.doc.toString() !== value)
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: value },
        annotations: fromOutside.of(true),
      });
  }, [value]);

  useEffect(() => {
    view.current?.dispatch({ effects: setErrorLine.of(errorLine) });
  }, [errorLine]);

  return <div className="mermaid-editor" ref={host} />;
};
