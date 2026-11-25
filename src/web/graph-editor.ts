import type { ValidationError } from "../schema/errors.ts";

/** What the graph editor starts from when a project has no graph yet. */
export const STARTER_MERMAID = `flowchart LR
  user([User]) -->|opens| app[Web app]
  app -->|reads| db[(Database)]`;

/** The Mermaid line an error is about, for the editor to mark; none when it names a node or edge. */
export const errorLine = (errors: readonly ValidationError[]): number | undefined => {
  for (const error of errors) {
    const line = /^line (\d+)$/.exec(error.path)?.[1];
    if (line) return Number(line);
  }
  return undefined;
};

/**
 * Whether the editor holds changes not saved yet, and whether they can be:
 * only once they read as a graph. `saved` is undefined while the project has
 * no graph, so even an unchanged starter can be saved; but it is not
 * `edited`: a graph saved elsewhere may replace it, as nothing is lost.
 */
export const editorState = ({
  text,
  saved,
  read,
}: {
  readonly text: string;
  readonly saved: string | undefined;
  /** The last read of `text`: undefined until it comes back. */
  readonly read: { readonly ok: boolean } | undefined;
}): { readonly unsaved: boolean; readonly canSave: boolean; readonly edited: boolean } => {
  const unsaved = text !== saved;
  return {
    unsaved,
    canSave: unsaved && read?.ok === true,
    edited: text !== (saved ?? STARTER_MERMAID),
  };
};

/**
 * What the editor does about the graph on disk: `saved` is it now, `synced`
 * the one this editor last took or wrote, both as generated Mermaid. A graph
 * saved elsewhere is taken, unless the user has edits: then it is flagged,
 * and taken if they undo them, so the graph shown is never an old one by
 * mistake. Nothing is done while this editor's own save is on its way.
 */
export const onDisk = ({
  saved,
  synced,
  edited,
  saving,
}: {
  readonly saved: string | undefined;
  readonly synced: string | undefined;
  readonly edited: boolean;
  readonly saving: boolean;
}): "same" | "take" | "flag" => {
  if (saving || saved === undefined || saved === synced) return "same";
  return edited ? "flag" : "take";
};
