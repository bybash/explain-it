import { describe, expect, it } from "vitest";
import { nextGate } from "./project.ts";

describe("nextGate", () => {
  it("is the gate after, and none after render", () => {
    expect(nextGate("graph")).toBe("script");
    expect(nextGate("preview")).toBe("render");
    expect(nextGate("render")).toBeUndefined();
  });
});
