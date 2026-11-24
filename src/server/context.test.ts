import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MAX_CONTEXT_CHARS } from "../schema/context.ts";
import { formatErrors } from "../schema/errors.ts";
import { addContext, listContext, readContext, removeContext } from "./context.ts";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "explain-it-context-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const problems = (result: {
  ok: boolean;
  errors?: readonly { path: string; message: string }[];
}) => (result.ok ? [] : formatErrors(result.errors ?? []));

describe("the context store", () => {
  it("keeps text under the project's context/, lists it with its size, reads it, and removes it", async () => {
    const added = await addContext(dir, { name: "Login spec.md", text: "# Login\nUsers sign in." });
    expect(added).toEqual({ ok: true, value: { name: "login-spec.md", chars: 22 } });
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
    expect(second.ok && second.value.name).toBe("pasted-2.md");
  });

  it("refuses context over the limit, saying by how much and what to do, and keeps nothing", async () => {
    await addContext(dir, { name: "big.md", text: "x".repeat(MAX_CONTEXT_CHARS - 10) });
    const over = await addContext(dir, { name: "more.md", text: "y".repeat(20) });
    expect(problems(over)).toEqual([
      `context: 100,010 characters with more.md; the most is 100,000. Remove a file or trim one, then add it again.`,
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

  it("reads and removes only files that are there, never a path outside context/", async () => {
    expect(problems(await readContext(dir, "../project.json"))).toEqual([
      'name: no context file "../project.json"',
    ]);
    expect(problems(await removeContext(dir, "nothing.md"))).toEqual([
      'name: no context file "nothing.md"',
    ]);
  });
});
