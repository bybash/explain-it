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
  it("are the three SPEC names", () => {
    expect(examples.sort()).toEqual(["checkout", "ci-pipeline", "oauth-login"]);
  });

  // Loading checks every file against its schema and the others, and that each logo it names is in assets/.
  it.each(examples)(
    "%s is a valid project with nothing to fix by the story checks or words read and said in time",
    async (name) => {
      const project = await loadProject(join(EXAMPLES, name));
      if (!project.ok) throw new Error(formatErrors(project.errors).join("\n"));
      expect(parseProject(json(name, "project.json")).ok).toBe(true);
      // Timed by the estimated voice, as a fresh checkout without the voice model times it.
      const plan = projectBeats(project.value);
      expect(formatErrors(scriptProblems(plan, project.value.storyboard))).toEqual([]);
    },
  );

  // A brief is optional (SPEC, Brief); the two drafted examples keep the one their script followed.
  it.each(["ci-pipeline", "checkout"])("%s keeps the brief its script follows", (name) => {
    expect(existsSync(join(EXAMPLES, name, "brief.json"))).toBe(true);
    expect(parseWith(BriefSchema, json(name, "brief.json")).ok).toBe(true);
  });
});
