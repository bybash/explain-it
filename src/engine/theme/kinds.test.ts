import { describe, expect, it } from "vitest";
import { lucideIcon } from "../../schema/icons.ts";
import { KIND_STYLES } from "./kinds.ts";

describe("KIND_STYLES", () => {
  it.each(Object.entries(KIND_STYLES))("%s has a Lucide icon", (_, style) => {
    expect(lucideIcon(style.icon)).toBeDefined();
  });
});
