import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import graphJson from "../../examples/oauth-login/graph.json" with { type: "json" };
import storyboardJson from "../../examples/oauth-login/storyboard.json" with { type: "json" };
import { fakeTts } from "../audio/fake-tts.testing.ts";
import { CHANGE_GUIDE } from "../guidance/change.ts";
import { changeSummary } from "../guidance/change-summary.ts";
import { authoringGuide, graphSummary, storyboardSummary } from "../guidance/guide.ts";
import { RenderQueue } from "../render/queue.ts";
import type { ServerEvent } from "../schema/api.ts";
import { parseConfig } from "../schema/config.ts";
import { orThrow } from "../schema/errors.ts";
import { parseGraph } from "../schema/graph.ts";
import { parseLayout } from "../schema/layout.ts";
import { parseProject } from "../schema/project.ts";
import { MAX_HOUSE_RULES } from "../schema/story.ts";
import { parseStoryboard } from "../schema/storyboard.ts";
import { createEvents } from "../server/events.ts";
import { createMcpServer } from "./server.ts";

const NOW = "2026-11-20T10:00:00.000Z";
const graph = orThrow(parseGraph(graphJson), "graph.json");
const { $schema: _graphSchema, ...graphFile } = graphJson;
const { $schema: _storyboardSchema, ...storyboardFile } = storyboardJson;
const preview = (slug: string) => `http://127.0.0.1:3000/#/projects/${slug}`;

let projectsDir: string;
let client: Client;
let published: ServerEvent[];
beforeEach(async () => {
  projectsDir = mkdtempSync(join(tmpdir(), "explain-it-mcp-"));
  published = [];
  const events = createEvents();
  events.subscribe((event) => published.push(event));
  const server = createMcpServer({
    projectsDir,
    now: () => new Date(NOW),
    events,
    previewUrl: preview,
    missingRenderTools: async () => [],
    runChecks: async () => {
      throw new Error("not checking in these tests");
    },
    tts: fakeTts().tts,
    // These tests never render; render-tools.test.ts covers the render tools.
    renders: new RenderQueue({
      now: () => new Date(NOW),
      run: async () => {
        throw new Error("not rendering in these tests");
      },
    }),
  });
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test", version: "1.0.0" });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
});
afterEach(async () => {
  await client.close();
  rmSync(projectsDir, { recursive: true, force: true });
});

/** Calls a tool; a success is its JSON, a failure the lines of its message. */
const call = async (name: string, args: Record<string, unknown>) => {
  const result = await client.callTool({ name, arguments: args });
  const content = result.content as { type: string; text: string }[];
  const text = content.map((c) => c.text).join("\n");
  return result.isError
    ? { ok: false as const, lines: text.split("\n") }
    : { ok: true as const, body: JSON.parse(text) };
};
const succeeds = async (name: string, args: Record<string, unknown>) => {
  const result = await call(name, args);
  if (!result.ok) throw new Error(`${name} failed:\n${result.lines.join("\n")}`);
  return result.body;
};
const fails = async (name: string, args: Record<string, unknown>) => {
  const result = await call(name, args);
  if (result.ok) throw new Error(`${name} succeeded: ${JSON.stringify(result.body)}`);
  return result.lines;
};
const readProjectFile = (slug: string, file: string) =>
  JSON.parse(readFileSync(join(projectsDir, slug, file), "utf8"));

/** The example's graph and storyboard, as an agent would send them. */
const exampleProject = async () => {
  const created = await succeeds("create_project", { graph: graphFile });
  await succeeds("set_storyboard", { slug: created.slug, storyboard: storyboardFile });
  return created.slug as string;
};

describe("tools", () => {
  it("lists the project tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "cancel_render",
      "check",
      "create_project",
      "explain_change",
      "get_guide",
      "get_project",
      "list_projects",
      "render",
      "render_status",
      "set_brief",
      "set_storyboard",
      "set_style",
      "update_graph",
    ]);
    for (const tool of tools) expect(tool.description?.length, tool.name).toBeGreaterThan(40);
  });
});

describe("create_project", () => {
  it("makes a project from a graph, laid out, with its Mermaid and a preview link", async () => {
    const body = await succeeds("create_project", {
      graph: graphFile,
      sources: [{ path: "src/auth/login.ts", commit: "abc1234" }],
    });
    expect(body.slug).toBe("signing-in-with-oauth");
    expect(body.preview).toBe(preview("signing-in-with-oauth"));
    expect(body.mermaid).toMatch(/^flowchart LR\n/);
    expect(body.mermaid).toContain('idp{{"Identity provider"}}');

    const project = orThrow(parseProject(readProjectFile(body.slug, "project.json")), "project");
    expect(project).toMatchObject({
      name: "Signing in with OAuth",
      origin: "mcp",
      gate: "graph",
      sources: [{ path: "src/auth/login.ts", commit: "abc1234" }],
      createdAt: NOW,
    });
    // The graph as sent, without the example file's $schema key.
    expect(parseGraph(readProjectFile(body.slug, "graph.json"))).toEqual(parseGraph(graphFile));
    const layout = parseLayout(readProjectFile(body.slug, "layout.json"), graph);
    expect(layout.ok).toBe(true);
    expect(published).toEqual([{ type: "project-created", slug: body.slug }]);
  });

  it("takes a name when one is given", async () => {
    const body = await succeeds("create_project", { name: "Login", graph: graphFile });
    expect(body.slug).toBe("login");
  });

  it("names each problem in the graph and arguments, and makes nothing", async () => {
    const lines = await fails("create_project", {
      graph: { ...graphFile, nodes: [{ id: "a", label: "A", kind: "robot" }] },
      sources: [{ path: "" }],
      extra: 1,
    });
    expect(lines).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^graph\.nodes\[0\]\.kind: must be one of "actor", /),
        "sources[0].path: must not be empty",
        "extra: unknown key",
      ]),
    );
    expect((await succeeds("list_projects", {})).projects).toEqual([]);
  });
});

describe("list_projects and get_project", () => {
  it("lists projects with a preview link each", async () => {
    const slug = await exampleProject();
    const body = await succeeds("list_projects", {});
    expect(body.projects).toEqual([
      {
        slug,
        name: "Signing in with OAuth",
        gate: "script",
        origin: "mcp",
        updatedAt: NOW,
        preview: preview(slug),
      },
    ]);
  });

  it("reads a project's files, its Mermaid and its preview link", async () => {
    const slug = await exampleProject();
    const body = await succeeds("get_project", { slug });
    expect(body.project.gate).toBe("script");
    expect(body.graph.title).toBe("Signing in with OAuth");
    expect(body.storyboard.scenes).toHaveLength(2);
    expect(body.layout.positions.user).toBeDefined();
    expect(body.config).toBeNull();
    expect(body.mermaid).toMatch(/^flowchart LR/);
    expect(body.preview).toBe(preview(slug));
  });

  it("says what each colour category looks like in the project's palette, to pick one by its colour", async () => {
    const slug = await exampleProject();
    expect((await succeeds("get_project", { slug })).colours.c2).toEqual({
      light: "#0f766e",
      dark: "#2dd4bf",
    });
    await succeeds("set_style", { slug, config: { theme: { palette: "ocean" } } });
    expect((await succeeds("get_project", { slug })).colours.c1.light).toBe("#7b3fe4");
  });

  it("names a project that does not exist", async () => {
    expect(await fails("get_project", { slug: "nope" })).toEqual(['slug: no project "nope"']);
    expect(await fails("get_project", {})).toEqual(["slug: required"]);
  });
});

describe("update_graph", () => {
  it("applies a JSON Patch, lays out again, and marks the beats that name what changed", async () => {
    const slug = await exampleProject();
    const at = graph.nodes.findIndex((n) => n.id === "idp");
    const body = await succeeds("update_graph", {
      slug,
      patch: [{ op: "replace", path: `/nodes/${at}/label`, value: "Google" }],
    });
    expect(body.mermaid).toContain('idp{{"Google"}}');
    expect(body.staleBeats.length).toBeGreaterThan(0);
    expect(readProjectFile(slug, "project.json").staleBeats).toEqual(body.staleBeats);
    expect(readProjectFile(slug, "graph.json").nodes[at].label).toBe("Google");
    expect(body.storyboardProblems).toEqual([]);
    expect(published.at(-1)).toEqual({ type: "project-updated", slug });
  });

  it("replaces the whole graph, and says which storyboard lines no longer fit", async () => {
    const slug = await exampleProject();
    const smaller = { ...graphFile, nodes: graphFile.nodes.filter((n) => n.id !== "idp") };
    smaller.edges = graphFile.edges.filter((e) => e.from !== "idp" && e.to !== "idp");
    const body = await succeeds("update_graph", { slug, graph: smaller });
    expect(body.storyboardProblems.length).toBeGreaterThan(0);
    expect(body.storyboardProblems[0]).toMatch(/^storyboard\.json: scenes\[\d+\]/);
  });

  it("takes a graph or a patch, not both or neither, and names a failed patch step", async () => {
    const slug = await exampleProject();
    // An error about a project ends with its preview link.
    const link = `preview: ${preview(slug)}`;
    expect(await fails("update_graph", { slug })).toEqual([
      "(arguments): give graph or patch",
      link,
    ]);
    expect(await fails("update_graph", { slug, graph: graphFile, patch: [] })).toEqual([
      "(arguments): give graph or patch, not both",
      link,
    ]);
    const lines = await fails("update_graph", {
      slug,
      patch: [{ op: "test", path: "/title", value: "Something else" }],
    });
    expect(lines[0]).toMatch(/^patch\[0\]: /);
  });
});

describe("set_storyboard", () => {
  it("saves a storyboard that fits the graph and returns its estimated timing", async () => {
    const created = await succeeds("create_project", { graph: graphFile });
    const body = await succeeds("set_storyboard", {
      slug: created.slug,
      storyboard: storyboardFile,
    });
    expect(body.timing.scenes.map((s: { id: string }) => s.id)).toEqual(["sign_in", "exchange"]);
    expect(body.timing.duration).toBeGreaterThan(10);
    const [first, second] = body.timing.scenes;
    expect(first.start).toBe(0);
    expect(second.start).toBeGreaterThan(first.end);
    expect(body.preview).toBe(preview(created.slug));
  });

  it("names what does not fit the graph", async () => {
    const created = await succeeds("create_project", { graph: graphFile });
    const broken = structuredClone(storyboardFile);
    const [first] = broken.scenes;
    if (!first) throw new Error("the example has scenes");
    first.nodes = ["ghost"];
    const lines = await fails("set_storyboard", { slug: created.slug, storyboard: broken });
    expect(lines.some((l) => l.startsWith("storyboard.scenes[0].nodes[0]: "))).toBe(true);
  });

  it("clears a stale beat once the beat itself changes", async () => {
    const slug = await exampleProject();
    const at = graph.nodes.findIndex((n) => n.id === "idp");
    const { staleBeats } = await succeeds("update_graph", {
      slug,
      patch: [{ op: "replace", path: `/nodes/${at}/label`, value: "Google" }],
    });
    const [beat, ...rest] = staleBeats as string[];
    const sceneAt = storyboardFile.scenes.findIndex((s) => s.beats.some((b) => b.id === beat));
    const beatAt = storyboardFile.scenes[sceneAt]?.beats.findIndex((b) => b.id === beat);
    await succeeds("set_storyboard", {
      slug,
      patch: [
        {
          op: "replace",
          path: `/scenes/${sceneAt}/beats/${beatAt}/caption`,
          value: "Google asks the user to agree.",
        },
      ],
    });
    expect(readProjectFile(slug, "project.json").staleBeats).toEqual(rest);
  });

  it("needs the graph first", async () => {
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(join(projectsDir, "bare"));
    writeFileSync(
      join(projectsDir, "bare", "project.json"),
      JSON.stringify({
        version: 1,
        name: "Bare",
        gate: "graph",
        staleBeats: [],
        origin: "mcp",
        createdAt: NOW,
        updatedAt: NOW,
      }),
    );
    expect(await fails("set_storyboard", { slug: "bare", storyboard: storyboardFile })).toEqual([
      "graph.json: missing; call create_project or update_graph first",
      `preview: ${preview("bare")}`,
    ]);
  });
});

describe("set_style", () => {
  it("sets the angle the scenes are seen from", async () => {
    const slug = await exampleProject();
    await succeeds("set_style", { slug, config: { angle: "wide" } });
    expect((await succeeds("get_project", { slug })).config.angle).toBe("wide");
    expect(await fails("set_style", { slug, config: { angle: "sideways" } })).toEqual(
      expect.arrayContaining([expect.stringMatching(/^config\.angle: /)]),
    );
  });

  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  it("merges settings into config.json, imports the logo and returns a preview link", async () => {
    const slug = await exampleProject();
    const body = await succeeds("set_style", {
      slug,
      config: { theme: { palette: "ocean" }, cards: { title: { title: "Sign in" } } },
      logo: {
        light: { dataUrl: `data:image/png;base64,${PNG.toString("base64")}` },
        corner: "bottom-right",
      },
    });
    expect(body.preview).toBe(preview(slug));
    const config = orThrow(parseConfig(readProjectFile(slug, "config.json")), "config");
    expect(config.theme).toEqual({ palette: "ocean", mode: "light" });
    expect(config.cards?.title).toEqual({ title: "Sign in" });
    expect(config.logo).toEqual({ light: "logo-light.png", corner: "bottom-right", show: "both" });
    expect(body.config).toEqual(config);
    expect(readFileSync(join(projectsDir, slug, "assets", "logo-light.png"))).toEqual(PNG);
    expect(readProjectFile(slug, "project.json").gate).toBe("style");

    // A second call keeps what the first set.
    await succeeds("set_style", { slug, config: { theme: { mode: "dark" } } });
    const again = orThrow(parseConfig(readProjectFile(slug, "config.json")), "config");
    expect(again.theme).toEqual({ palette: "ocean", mode: "dark" });
    expect(again.logo?.light).toBe("logo-light.png");
  });

  it("sets a scene's camera and how long the title card holds, and names what is out of range", async () => {
    const slug = await exampleProject();
    await succeeds("set_style", {
      slug,
      config: {
        camera: { sign_in: { zoom: 1.4, x: 0.1, y: -0.05 } },
        cards: { title: { title: "Sign in", seconds: 4 } },
      },
    });
    const { config } = await succeeds("get_project", { slug });
    expect(config.camera).toEqual({ sign_in: { zoom: 1.4, x: 0.1, y: -0.05 } });
    expect(config.cards.title.seconds).toBe(4);
    expect(
      await fails("set_style", {
        slug,
        config: {
          camera: { sign_in: { zoom: 3.5, x: 0, y: 0.9 } },
          cards: { title: { seconds: 1 } },
        },
      }),
    ).toEqual(
      expect.arrayContaining([
        "config.camera.sign_in.zoom: must be at most 3",
        "config.camera.sign_in.y: must be at most 0.5",
        "config.cards.title.seconds: must be at least 2",
      ]),
    );
  });

  it("names a bad setting or logo, and changes nothing", async () => {
    const slug = await exampleProject();
    const lines = await fails("set_style", {
      slug,
      config: { voice: { speed: 9 } },
      logo: { dark: { path: "relative.svg" } },
    });
    expect(lines).toEqual(
      expect.arrayContaining([
        "config.voice.speed: must be at most 2",
        "logo.dark.path: must be an absolute path",
      ]),
    );
    expect(() => readProjectFile(slug, "config.json")).toThrow();
  });
});

describe("review fixes", () => {
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>';
  const dataUrl = (type: string, data: Buffer | string) =>
    `data:${type};base64,${Buffer.from(data).toString("base64")}`;

  it("ends an error about a project with that project's preview link", async () => {
    const slug = await exampleProject();
    const lines = await fails("update_graph", {
      slug,
      patch: [{ op: "test", path: "/title", value: "Something else" }],
    });
    expect(lines.at(-1)).toBe(`preview: ${preview(slug)}`);
  });

  it("checks a logo named in config like one sent as a file", async () => {
    const slug = await exampleProject();
    expect(await fails("set_style", { slug, config: { logo: { light: "nope.png" } } })).toEqual(
      expect.arrayContaining(["config.logo.light: assets/nope.png missing"]),
    );
  });

  it("removes a setting given as null", async () => {
    const slug = await exampleProject();
    await succeeds("set_style", { slug, config: { cards: { title: { title: "Sign in" } } } });
    await succeeds("set_style", { slug, config: { cards: { title: null } } });
    expect(readProjectFile(slug, "config.json").cards).toEqual({});
  });

  it("replaces a logo whose type changed, leaving no old file behind", async () => {
    const { existsSync } = await import("node:fs");
    const slug = await exampleProject();
    await succeeds("set_style", { slug, logo: { light: { dataUrl: dataUrl("image/png", PNG) } } });
    await succeeds("set_style", {
      slug,
      logo: { light: { dataUrl: dataUrl("image/svg+xml", SVG) } },
    });
    expect(existsSync(join(projectsDir, slug, "assets", "logo-light.png"))).toBe(false);
    expect(readProjectFile(slug, "config.json").logo.light).toBe("logo-light.svg");
  });

  it("warns when a broken layout.json or config.json is replaced", async () => {
    const { writeFileSync } = await import("node:fs");
    const slug = await exampleProject();
    writeFileSync(join(projectsDir, slug, "layout.json"), "{");
    const graphBody = await succeeds("update_graph", { slug, graph: graphFile });
    expect(graphBody.warnings).toEqual([
      "layout.json was broken, so the graph was laid out from scratch and any manual positions in it were dropped",
    ]);
    writeFileSync(join(projectsDir, slug, "config.json"), "{");
    const styleBody = await succeeds("set_style", { slug, config: { font: "inter" } });
    expect(styleBody.warnings).toEqual([
      "config.json was broken, so it was started again from these settings",
    ]);
  });

  it("keeps both of two edits made at the same time", async () => {
    const slug = await exampleProject();
    const label = (i: number, value: string) => ({
      slug,
      patch: [{ op: "replace", path: `/nodes/${i}/label`, value }],
    });
    await Promise.all([
      succeeds("update_graph", label(0, "First")),
      succeeds("update_graph", label(1, "Second")),
    ]);
    const nodes = readProjectFile(slug, "graph.json").nodes;
    expect([nodes[0].label, nodes[1].label]).toEqual(["First", "Second"]);
  });
});

describe("set_brief and the house rules", () => {
  const BRIEF = {
    version: 1,
    audience: "Product managers",
    takeaway: "Sign-in never shows the app your password.",
    shape: "problem",
    hook: "Where does your password go when you sign in?",
    notes: "Leave out token refresh.",
  };

  it("saves the brief, which get_project then returns, and leaves the gate where it was", async () => {
    const { slug } = await succeeds("create_project", { graph: graphFile });
    const saved = await succeeds("set_brief", { slug, brief: BRIEF });
    expect(saved).toEqual({ brief: BRIEF, preview: preview(slug) });
    expect(published).toContainEqual({ type: "project-updated", slug });
    const body = await succeeds("get_project", { slug });
    expect(body.brief).toEqual(BRIEF);
    expect(body.project.gate).toBe("graph");
  });

  it("names what is wrong in the brief, and saves nothing", async () => {
    const { slug } = await succeeds("create_project", { graph: graphFile });
    expect(await fails("set_brief", { slug, brief: { version: 1, shape: "saga" } })).toEqual([
      'brief.shape: must be one of "problem", "before-after", "failure", "zoom"',
      `preview: ${preview(slug)}`,
    ]);
    expect((await succeeds("get_project", { slug })).brief).toBeNull();
  });

  it("gives the house rules in get_project, get_guide and the prompt", async () => {
    const { slug } = await succeeds("create_project", { graph: graphFile });
    expect((await succeeds("get_project", { slug })).houseRules).toBeNull();
    const rules = "- No jargon.\n- End with a link to the docs.";
    writeFileSync(join(projectsDir, "house-rules.md"), rules);
    expect((await succeeds("get_project", { slug })).houseRules).toBe(rules);
    const guide = await client.callTool({ name: "get_guide", arguments: {} });
    expect(guide.content).toEqual([{ type: "text", text: authoringGuide({ houseRules: rules }) }]);
    const { messages } = await client.getPrompt({ name: "explain_flow", arguments: {} });
    expect(messages[0]?.content).toEqual({
      type: "text",
      text: authoringGuide({ houseRules: rules }),
    });
  });
});

describe("house rules over the limit", () => {
  it("are named as the broken file by get_project and get_guide, not passed on", async () => {
    const { slug } = await succeeds("create_project", { graph: graphFile });
    writeFileSync(join(projectsDir, "house-rules.md"), "x".repeat(MAX_HOUSE_RULES + 1));
    expect((await fails("get_project", { slug }))[0]).toMatch(/^house-rules\.md/);
    const guide = await client.callTool({ name: "get_guide", arguments: {} });
    expect(guide.isError).toBe(true);
  });
});

describe("explaining a change", () => {
  it("sums up a change's video from its script, with the files it covers", async () => {
    const sources = [{ path: "src/auth/login.ts", commit: "9a4df3c2b1" }];
    const created = await succeeds("create_project", { graph: graphFile, sources });
    await succeeds("set_storyboard", { slug: created.slug, storyboard: storyboardFile });
    const body = await succeeds("explain_change", { slug: created.slug });
    expect(body).toEqual({
      summary: changeSummary({
        name: "Signing in with OAuth",
        storyboard: orThrow(parseStoryboard(storyboardJson, graph), "storyboard.json"),
        brief: null,
        sources,
      }),
      video: null,
      poster: null,
      outdated: false,
      preview: preview(created.slug),
    });
  });

  it("links the video where it was put for readers, never a path on this machine", async () => {
    const slug = await exampleProject();
    const url = "https://github.com/acme/app/assets/video.mp4";
    const linked = await succeeds("explain_change", { slug, video_url: url });
    expect(linked.summary).toContain(`[Watch the video](<${url}>)`);
    for (const local of ["file:///Users/me/video.mp4", "http://127.0.0.1:3000/video.mp4"])
      expect(await fails("explain_change", { slug, video_url: local }), local).toEqual(
        expect.arrayContaining([expect.stringMatching(/^video_url: /)]),
      );
  });

  it("gives the newest render's light video and poster, and says when the script changed since", async () => {
    const slug = await exampleProject();
    const render = (stamp: string, createdAt: string) => {
      const dir = join(projectsDir, slug, "out", stamp);
      for (const theme of ["dark", "light"]) mkdirSync(join(dir, theme), { recursive: true });
      for (const file of ["dark/video.mp4", "light/video.mp4", "light/poster.png"])
        writeFileSync(join(dir, file), "x");
      writeFileSync(
        join(dir, "render.json"),
        JSON.stringify({
          version: 1,
          createdAt,
          resolution: "1080p",
          themes: ["dark", "light"],
          seconds: 60,
        }),
      );
      return dir;
    };
    render("2026-11-20T09-00-00.000Z", "2026-11-20T09:00:00.000Z");
    const newest = render("2026-11-20T11-00-00.000Z", "2026-11-20T11:00:00.000Z");
    const body = await succeeds("explain_change", { slug });
    expect(body).toMatchObject({
      video: join(newest, "light", "video.mp4"),
      poster: join(newest, "light", "poster.png"),
      outdated: false,
    });
    // The project was last changed at 10:00 (NOW); a render from before then shows an older script.
    rmSync(newest, { recursive: true });
    expect((await succeeds("explain_change", { slug })).outdated).toBe(true);
  });

  it("asks for the script first, as the summary is made from it", async () => {
    const created = await succeeds("create_project", { graph: graphFile });
    expect(await fails("explain_change", { slug: created.slug })).toContain(
      "storyboard: there is no script yet: write it with set_storyboard first",
    );
  });

  it("offers the explain_change prompt: the change, how to tell it, then the guide", async () => {
    const { messages } = await client.getPrompt({
      name: "explain_change",
      arguments: { change: "pull request #105" },
    });
    const text = messages.map((m) => (m.content.type === "text" ? m.content.text : "")).join("\n");
    expect(text.split("\n")[0]).toContain("pull request #105");
    expect(text).toContain(CHANGE_GUIDE);
    expect(text).toContain(authoringGuide());
  });
});

describe("guidance", () => {
  it("offers the explain_flow and explain_change prompts, each with an optional subject", async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts).toEqual([
      expect.objectContaining({
        name: "explain_flow",
        arguments: [expect.objectContaining({ name: "topic", required: false })],
      }),
      expect.objectContaining({
        name: "explain_change",
        arguments: [expect.objectContaining({ name: "change", required: false })],
      }),
    ]);
  });

  it("opens the prompt with the topic, then the whole guide", async () => {
    const { messages } = await client.getPrompt({
      name: "explain_flow",
      arguments: { topic: "how login works" },
    });
    const text = messages.map((m) => (m.content.type === "text" ? m.content.text : "")).join("\n");
    expect(text.split("\n")[0]).toContain("how login works");
    expect(text).toContain(authoringGuide());
    const plain = await client.getPrompt({ name: "explain_flow", arguments: {} });
    expect(plain.messages[0]?.content).toEqual({ type: "text", text: authoringGuide() });
  });

  it("gives the same guide to an agent through get_guide, as plain text", async () => {
    const result = await client.callTool({ name: "get_guide", arguments: {} });
    expect(result.content).toEqual([{ type: "text", text: authoringGuide() }]);
  });

  it("describes the formats in the graph and storyboard tools, and points at the guide", async () => {
    const { tools } = await client.listTools();
    const description = (name: string) => tools.find((t) => t.name === name)?.description ?? "";
    expect(description("create_project")).toContain(graphSummary());
    expect(description("update_graph")).toContain(graphSummary());
    expect(description("set_storyboard")).toContain(storyboardSummary());
  });
});
