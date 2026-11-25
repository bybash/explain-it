import { describe, expect, it } from "vitest";
import { editorState, errorLine, STARTER_MERMAID } from "./graph-editor.ts";

describe("errorLine", () => {
  it("is the first error that names a line", () => {
    expect(
      errorLine([
        { path: "(diagram)", message: "x" },
        { path: "line 7", message: "y" },
      ]),
    ).toBe(7);
    expect(errorLine([{ path: 'node "a": label', message: "too long" }])).toBeUndefined();
  });
});

describe("editorState", () => {
  it("says whether there is anything to save, and whether it can be", () => {
    expect(editorState({ text: "a", saved: "a", read: { ok: true } })).toEqual({
      unsaved: false,
      canSave: false,
      edited: false,
    });
    expect(editorState({ text: "b", saved: "a", read: { ok: true } })).toEqual({
      unsaved: true,
      canSave: true,
      edited: true,
    });
    // Not read yet, or unreadable: nothing to save until it reads.
    expect(editorState({ text: "b", saved: "a", read: undefined })).toEqual({
      unsaved: true,
      canSave: false,
      edited: true,
    });
    expect(editorState({ text: "b", saved: "a", read: { ok: false } })).toEqual({
      unsaved: true,
      canSave: false,
      edited: true,
    });
    // A project with no graph yet can save its starter as it stands.
    expect(editorState({ text: STARTER_MERMAID, saved: undefined, read: { ok: true } })).toEqual({
      unsaved: true,
      canSave: true,
      edited: false,
    });
  });

  it("counts an untouched starter as nothing to lose, but one changed as the user's own", () => {
    const read = { ok: true };
    expect(editorState({ text: STARTER_MERMAID, saved: undefined, read }).edited).toBe(false);
    expect(editorState({ text: `${STARTER_MERMAID}\n`, saved: undefined, read }).edited).toBe(true);
  });
});
