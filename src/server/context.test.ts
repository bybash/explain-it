import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MAX_CONTEXT_CHARS, MAX_CONTEXT_NAME } from "../schema/context.ts";
import { formatErrors, type ValidationError } from "../schema/errors.ts";
import { addContext, listContext, readContext, removeContext } from "./context.ts";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "explain-it-context-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const problems = (result: object) =>
  formatErrors("errors" in result ? (result.errors as readonly ValidationError[]) : []);

describe("the context store", () => {
  it("keeps text under the project's context/, lists it with its size, reads it, and removes it", async () => {
    const added = await addContext(dir, { name: "Login spec.md", text: "# Login\nUsers sign in." });
    expect(added).toEqual({ kind: "added", file: { name: "login-spec.md", chars: 22 } });
    expect(readFileSync(join(dir, "context", "login-spec.md"), "utf8")).toBe(
      "# Login\nUsers sign in.",
    );
    expect(await listContext(dir)).toEqual({
      files: [{ name: "login-spec.md", chars: 22 }],
      chars: 22,
      max: MAX_CONTEXT_CHARS,
    });
    expect(await readContext(dir, "login-spec.md")).toEqual({
      ok: true,
      value: "# Login\nUsers sign in.",
    });
    expect((await removeContext(dir, "login-spec.md")).ok).toBe(true);
    expect((await listContext(dir)).files).toEqual([]);
  });

  it("gives a second file of the same name a name of its own", async () => {
    await addContext(dir, { name: "pasted.md", text: "one" });
    const second = await addContext(dir, { name: "pasted.md", text: "two" });
    expect(second.kind === "added" && second.file.name).toBe("pasted-2.md");
  });

  it("refuses context over the limit, saying by how much and what to do, and keeps nothing", async () => {
    await addContext(dir, { name: "big.md", text: "x".repeat(MAX_CONTEXT_CHARS - 10) });
    const over = await addContext(dir, { name: "more.md", text: "y".repeat(20) });
    expect(problems(over)).toEqual([
      "text: more.md would take the context to 100,010 characters, 10 over the most it can hold (100,000). Remove a file or trim one, then add it again.",
    ]);
    expect((await listContext(dir)).files.map((f) => f.name)).toEqual(["big.md"]);
  });

  it("takes only text files of the kinds it knows", async () => {
    expect(problems(await addContext(dir, { name: "photo.png", text: "abc" }))).toEqual([
      'name: ".png" is not a kind of context; use a text file such as .md, .txt, .mmd or source code',
    ]);
    expect(problems(await addContext(dir, { name: "notes.txt", text: "a\u0000b" }))).toEqual([
      "text: not text: the file looks binary",
    ]);
  });

  it("keeps every name it gives within the limit, and can read and remove it", async () => {
    const long = `${"a".repeat(MAX_CONTEXT_NAME - 5)}--.md`;
    for (const text of ["one", "two", "three"]) {
      const added = await addContext(dir, { name: long, text });
      if (added.kind !== "added") throw new Error("not added");
      expect(added.file.name.length).toBeLessThanOrEqual(MAX_CONTEXT_NAME);
      expect(await readContext(dir, added.file.name)).toEqual({ ok: true, value: text });
    }
    for (const { name } of (await listContext(dir)).files)
      expect((await removeContext(dir, name)).ok, name).toBe(true);
    expect((await listContext(dir)).files).toEqual([]);
  });

  it("takes files put there by hand, and passes over anything that is not context", async () => {
    mkdirSync(join(dir, "context", "folder.md"), { recursive: true });
    writeFileSync(join(dir, "context", ".DS_Store"), "x");
    writeFileSync(join(dir, "context", "photo.png"), "x");
    writeFileSync(join(dir, "context", "My Notes.md"), "by hand");
    writeFileSync(join(dir, "secret.md"), "outside");
    symlinkSync(join(dir, "secret.md"), join(dir, "context", "link.md"));
    expect((await listContext(dir)).files).toEqual([{ name: "My Notes.md", chars: 7 }]);
    expect(await readContext(dir, "My Notes.md")).toEqual({ ok: true, value: "by hand" });
    expect((await readContext(dir, "link.md")).ok).toBe(false);
  });

  it("reads and removes only files that are there, never a path outside context/", async () => {
    expect(problems(await readContext(dir, "../project.json"))).toEqual([
      'name: no context file "../project.json"',
    ]);
    expect(problems(await removeContext(dir, "nothing.md"))).toEqual([
      'name: no context file "nothing.md"',
    ]);
  });
});
