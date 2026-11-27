import { describe, expect, it } from "vitest";
import exampleGraph from "../../examples/oauth-login/graph.json" with { type: "json" };
import exampleStoryboard from "../../examples/oauth-login/storyboard.json" with { type: "json" };
import { orThrow } from "../schema/errors.ts";
import { parseGraph } from "../schema/graph.ts";
import { parseStoryboard } from "../schema/storyboard.ts";
import { changeSummary } from "./change-summary.ts";

const graph = orThrow(parseGraph(exampleGraph), "graph");
const storyboard = orThrow(parseStoryboard(exampleStoryboard, graph), "storyboard");

const summary = (over: Partial<Parameters<typeof changeSummary>[0]> = {}) =>
  changeSummary({
    name: "OAuth login",
    storyboard,
    brief: {
      version: 1,
      takeaway: "The app never sees the password.",
      shape: "before-after",
    },
    sources: [{ path: "src/auth/login.ts", commit: "9a4df3c2b1" }],
    ...over,
  });

describe("changeSummary", () => {
  it("leads with the name and the one thing to remember", () => {
    const lines = summary().split("\n");
    expect(lines[0]).toBe("### OAuth login");
    expect(lines).toContain("The app never sees the password.");
  });

  it("tells each scene as its title and its beats' captions, in order, as the video does", () => {
    const text = summary();
    expect(text).toContain(
      "**Sign in**\n- A user wants to sign in.\n- The app hands off to the identity provider.",
    );
    expect(text.indexOf("**Sign in**")).toBeLessThan(text.indexOf("**Token exchange**"));
  });

  it("says which files it covers, by their short commit", () => {
    expect(summary()).toContain("Covers `src/auth/login.ts` at 9a4df3c.");
  });

  it("says when the files it covers were not recorded, rather than nothing", () => {
    expect(summary({ sources: undefined })).toContain("The files it covers were not recorded.");
  });

  it("links the video when there is one", () => {
    expect(summary({ video: "out/2026/light/video.mp4" })).toContain(
      "[Watch the video](out/2026/light/video.mp4)",
    );
  });

  it("leaves out the takeaway when there is no brief", () => {
    expect(summary({ brief: null }).split("\n")[2]).toBe("**Sign in**");
  });
});
