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
 * no graph, so even an unchanged starter is a change.
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
}): { readonly unsaved: boolean; readonly canSave: boolean } => {
  const unsaved = text !== saved;
  return { unsaved, canSave: unsaved && read?.ok === true };
};
