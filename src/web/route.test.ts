import { describe, expect, it } from "vitest";
import { gateSteps, route } from "./route.ts";

describe("route", () => {
  it("names the page an address shows", () => {
    expect(route("")).toEqual({ page: "list" });
    expect(route("#/settings")).toEqual({ page: "settings" });
    expect(route("#/projects/oauth-login")).toEqual({ page: "project", slug: "oauth-login" });
    expect(route("#/projects/oauth-login/style")).toEqual({
      page: "project",
      slug: "oauth-login",
      gate: "style",
    });
    expect(route("#/projects/oauth-login/nonsense")).toEqual({
      page: "project",
      slug: "oauth-login",
    });
  });
});

describe("gateSteps", () => {
  it("opens every gate up to the one reached, and shows the one viewed", () => {
    expect(gateSteps("style", "graph")).toEqual([
      { gate: "graph", state: "done", open: true, viewed: true },
      { gate: "script", state: "done", open: true, viewed: false },
      { gate: "style", state: "current", open: true, viewed: false },
      { gate: "preview", state: "next", open: false, viewed: false },
      { gate: "render", state: "next", open: false, viewed: false },
    ]);
  });

  it("shows the gate reached when none is requested, or one not reached yet", () => {
    expect(gateSteps("script").find((s) => s.viewed)?.gate).toBe("script");
    expect(gateSteps("script", "render").find((s) => s.viewed)?.gate).toBe("script");
  });
});
