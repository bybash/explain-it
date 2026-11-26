import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { scriptProblems } from "../checks/story.ts";
import { projectBeats } from "../engine/beats/build.ts";
import { formatErrors, parseWith } from "../schema/errors.ts";
import { parseProject } from "../schema/project.ts";
import { BriefSchema } from "../schema/story.ts";
import { loadProject } from "./load.ts";

const EXAMPLES = resolve("examples");
const examples = readdirSync(EXAMPLES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
const json = (dir: string, file: string): unknown =>
  JSON.parse(readFileSync(join(EXAMPLES, dir, file), "utf8"));

describe("the examples (6.2)", () => {
  it("are the three the roadmap names", () => {
    expect(examples.sort()).toEqual(["checkout", "ci-pipeline", "oauth-login"]);
  });

  it.each(examples)("%s is a valid project, with its brief and its logos", async (name) => {
    const project = await loadProject(join(EXAMPLES, name));
    expect(project.ok ? [] : formatErrors(project.errors)).toEqual([]);
    expect(parseProject(json(name, "project.json")).ok).toBe(true);
    if (existsSync(join(EXAMPLES, name, "brief.json")))
      expect(parseWith(BriefSchema, json(name, "brief.json")).ok).toBe(true);
    const logo = project.ok ? project.value.config.logo : undefined;
    for (const file of [logo?.light, logo?.dark].filter((f) => f !== undefined))
      expect(existsSync(join(EXAMPLES, name, "assets", file))).toBe(true);
  });

  it.each(examples)(
    "%s tells its story with nothing to fix: the story checks, and words read and said in time",
    async (name) => {
      const project = await loadProject(join(EXAMPLES, name));
      if (!project.ok) throw new Error(formatErrors(project.errors).join("\n"));
      // Timed by the estimated voice, as a fresh checkout without the voice model times it.
      const plan = projectBeats(project.value);
      expect(formatErrors(scriptProblems(plan, project.value.storyboard))).toEqual([]);
    },
  );
});
