import { cpSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { formatErrors } from "../schema/errors.ts";
import { loadProject } from "./load.ts";

const example = new URL("../../examples/oauth-login/", import.meta.url).pathname;
const temps: string[] = [];
const copyOfExample = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "explain-it-load-"));
  temps.push(dir);
  cpSync(example, dir, { recursive: true });
  return dir;
};
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const errorsOf = async (dir: string) => {
  const result = await loadProject(dir);
  return result.ok ? [] : formatErrors(result.errors);
};

describe("loadProject", () => {
  it("reads and validates the example", async () => {
    const result = await loadProject(example);
    if (!result.ok) throw new Error(formatErrors(result.errors).join("\n"));
    expect(result.value.graph.title).toBeTruthy();
    expect(result.value.storyboard.scenes.map((s) => s.id)).toEqual(["sign_in", "exchange"]);
    expect(result.value.config.theme.mode).toBe("both");
    expect(Object.keys(result.value.layout.positions)).toContain("user");
  });

  it("names the file and the field of each problem", async () => {
    const dir = copyOfExample();
    writeFileSync(join(dir, "storyboard.json"), JSON.stringify({ version: 1, scenes: [] }));
    expect(await errorsOf(dir)).toEqual(["storyboard.json: scenes: 0 items, min 1"]);
  });

  it("says which file is missing or is not JSON", async () => {
    const dir = copyOfExample();
    unlinkSync(join(dir, "layout.json"));
    writeFileSync(join(dir, "storyboard.json"), "{ nope");
    const errors = await errorsOf(dir);
    expect(errors).toContain("layout.json: missing; run `npm run layout -- <project>`");
    expect(errors.some((e) => e.startsWith("storyboard.json: not valid JSON"))).toBe(true);
  });

  it("uses the default config when the project has none", async () => {
    const dir = copyOfExample();
    unlinkSync(join(dir, "config.json"));
    const result = await loadProject(dir);
    expect(result.ok && result.value.config.theme.mode).toBe("light");
  });

  it("does not check the storyboard and layout against a broken graph", async () => {
    const dir = copyOfExample();
    writeFileSync(join(dir, "graph.json"), JSON.stringify({ version: 1 }));
    const errors = await errorsOf(dir);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.every((e) => e.startsWith("graph.json: "))).toBe(true);
  });
});
