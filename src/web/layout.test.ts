import { describe, expect, it } from "vitest";
import { layoutChoices, readLayout, shownLayout } from "./layout.ts";

describe("the project page's layout", () => {
  it("is what was chosen, while it fits", () => {
    for (const layout of ["chat", "split", "panel"] as const)
      expect(shownLayout(layout, { wide: true })).toBe(layout);
    expect(shownLayout("panel", { wide: false })).toBe("panel");
  });

  it("has no split on a narrow screen: the chat stands in, and the choice is kept", () => {
    expect(layoutChoices({ wide: true })).toEqual(["chat", "split", "panel"]);
    expect(layoutChoices({ wide: false })).toEqual(["chat", "panel"]);
    expect(shownLayout("split", { wide: false })).toBe("chat");
  });

  it("starts split, and reads only a layout it knows", () => {
    expect(readLayout(null)).toBe("split");
    expect(readLayout("sideways")).toBe("split");
    expect(readLayout("chat")).toBe("chat");
  });
});
