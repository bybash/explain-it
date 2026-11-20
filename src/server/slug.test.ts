import { describe, expect, it } from "vitest";
import { MAX_SLUG } from "../schema/api.ts";
import { slugify } from "./slug.ts";

describe("slugify", () => {
  it("turns a name into lower-case words joined by hyphens", () => {
    expect(slugify("OAuth login", [])).toBe("oauth-login");
    expect(slugify("  CI / CD pipeline!  ", [])).toBe("ci-cd-pipeline");
  });

  it("folds accents and drops other symbols", () => {
    expect(slugify("Café über straße", [])).toBe("cafe-uber-strasse");
    expect(slugify("Checkout 🛒 flow", [])).toBe("checkout-flow");
  });

  it("adds -2, -3 and so on when the slug is taken", () => {
    expect(slugify("OAuth login", ["oauth-login"])).toBe("oauth-login-2");
    expect(slugify("OAuth login", ["oauth-login", "oauth-login-2"])).toBe("oauth-login-3");
  });

  it("is never empty, and never longer than the schema allows", () => {
    expect(slugify("🛒🛒", [])).toBe("project");
    expect(slugify("🛒", ["project"])).toBe("project-2");
    const long = slugify("word ".repeat(40), []);
    expect(long.length).toBeLessThanOrEqual(MAX_SLUG);
    expect(long).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});
