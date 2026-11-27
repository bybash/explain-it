import { describe, expect, it } from "vitest";
import { modelChoices, SUGGESTED_MODEL } from "../schema/settings.ts";
import { modelGroups, OTHER_MODEL, pickedModel } from "./model-picker.ts";

describe("pickedModel", () => {
  const choices = modelChoices("openrouter");

  it("shows a listed model as itself", () => {
    expect(pickedModel(choices, "google/gemini-4-carbon")).toBe("google/gemini-4-carbon");
  });

  it("shows a model the list lacks, or none yet, as another model to type", () => {
    expect(pickedModel(choices, "acme/secret-model")).toBe(OTHER_MODEL);
    expect(pickedModel(choices, "")).toBe(OTHER_MODEL);
  });
});

describe("modelGroups", () => {
  it("groups the choices by family, in the order the list first names them", () => {
    const groups = modelGroups(modelChoices("openrouter"));
    expect(groups.map((g) => g.family)).toEqual(["Claude", "Gemini", "GPT", "Other"]);
    expect(groups[0]?.choices[0]?.id).toBe(SUGGESTED_MODEL);
  });

  it("has no groups for an endpoint with no list", () => {
    expect(modelGroups(modelChoices("ollama"))).toEqual([]);
  });
});
