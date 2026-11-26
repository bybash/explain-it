import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { inFile } from "../render/load.ts";
import { writeWhole } from "../render/write-whole.ts";
import type { OpenedProject } from "../schema/api.ts";
import { parseWith, type Validated } from "../schema/errors.ts";
import { fail, ok } from "../schema/result.ts";
import { type Brief, BriefSchema, HouseRulesSchema } from "../schema/story.ts";
import { writeProjectFile } from "./projects.ts";

/** The house rules' file, in the projects folder beside the projects. */
export const HOUSE_RULES_FILE = "house-rules.md";

/**
 * Replaces a project's story brief with `data`, once it is valid, and marks
 * the project updated. Shared by the Script gate and MCP's `set_brief`.
 */
export const saveBrief = async (
  projectsDir: string,
  opened: OpenedProject,
  data: unknown,
  now: Date,
): Promise<Validated<Brief>> => {
  const brief = parseWith(BriefSchema, data);
  if (!brief.ok) return brief;
  await writeProjectFile(projectsDir, opened.slug, "brief.json", brief.value);
  await writeProjectFile(projectsDir, opened.slug, "project.json", {
    ...opened.project,
    updatedAt: now.toISOString(),
  });
  return brief;
};

/**
 * The house rules every project follows, checked as any file read from disk
 * is, since they can be edited by hand; null when none are written.
 */
export const readHouseRules = async (projectsDir: string): Promise<Validated<string | null>> => {
  let text: string;
  try {
    text = await readFile(join(projectsDir, HOUSE_RULES_FILE), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return ok(null);
    throw error;
  }
  const rules = parseWith(HouseRulesSchema, text);
  if (!rules.ok) return fail(inFile(HOUSE_RULES_FILE, rules.errors));
  return ok(rules.value.trim() === "" ? null : rules.value);
};

/** Writes the house rules, already checked against their schema. */
export const writeHouseRules = (projectsDir: string, text: string): Promise<void> =>
  writeWhole(join(projectsDir, HOUSE_RULES_FILE), text);
