import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakeTts } from "../audio/fake-tts.testing.ts";
import { LOGO_MAX_BYTES } from "../schema/config.ts";
import { createApp } from "./app.ts";
import { copyExample } from "./example.testing.ts";
import { settingsStore } from "./settings.ts";

const NOW = "2026-11-23T10:00:00.000Z";
/** The start of a PNG: enough for the logo's content check. */
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const png = (bytes = PNG) => `data:image/png;base64,${bytes.toString("base64")}`;

let projectsDir: string;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  projectsDir = mkdtempSync(join(tmpdir(), "explain-it-style-"));
  copyExample(projectsDir, "oauth");
  // Without the example's own logo, so each test starts from none.
  const { logo: _logo, ...config } = JSON.parse(readFileSync(configFile(), "utf8"));
  writeFileSync(configFile(), JSON.stringify(config));
  app = createApp({
    projectsDir,
    now: () => new Date(NOW),
    tts: fakeTts().tts,
    settings: settingsStore({ envFile: join(projectsDir, ".env"), environment: {} }),
  });
});
afterEach(() => rmSync(projectsDir, { recursive: true, force: true }));

const putStyle = (slug: string, body: unknown) =>
  app.request(`/api/projects/${slug}/style`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
function configFile() {
  return join(projectsDir, "oauth", "config.json");
}
const configOnDisk = () => JSON.parse(readFileSync(configFile(), "utf8"));

describe("PUT /api/projects/:slug/style", () => {
  it("merges the change into config.json and answers with the whole config", async () => {
    const before = configOnDisk();
    const response = await putStyle("oauth", {
      config: { theme: { palette: "ocean" }, cards: { end: { link: null } } },
    });
    expect(response.status).toBe(200);
    const { config } = await response.json();
    expect(config.theme).toEqual({ ...before.theme, palette: "ocean" });
    expect(configOnDisk().theme.palette).toBe("ocean");
    expect(configOnDisk().cards.end.link).toBeUndefined();
    expect(configOnDisk().cards.end.headline).toBe(before.cards.end.headline);
  });

  it("names what is wrong and writes nothing", async () => {
    const before = configOnDisk();
    const response = await putStyle("oauth", {
      config: { theme: { palette: "Not a palette" }, cards: { title: { title: "" } } },
    });
    expect(response.status).toBe(400);
    const paths = (await response.json()).errors.map((e: { path: string }) => e.path).sort();
    expect(paths).toEqual(["config.cards.title.title", "config.theme.palette"]);
    expect(configOnDisk()).toEqual(before);
  });

  it("copies a logo into assets/ and serves it back for the preview, one file for both modes", async () => {
    const response = await putStyle("oauth", {
      logo: { light: { dataUrl: png() }, corner: "bottom-right" },
    });
    expect(response.status).toBe(200);
    expect(configOnDisk().logo).toEqual({ light: "logo-light.png", corner: "bottom-right" });
    expect(readFileSync(join(projectsDir, "oauth", "assets", "logo-light.png"))).toEqual(PNG);

    const logo = await app.request("/api/projects/oauth/logo");
    expect(logo.status).toBe(200);
    expect(await logo.json()).toEqual({ logo: { light: png(), dark: png() } });
  });

  it("takes a logo as large as a logo may be", async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(LOGO_MAX_BYTES - PNG.length)]);
    const response = await putStyle("oauth", { logo: { dark: { dataUrl: png(big) } } });
    expect(response.status).toBe(200);
  });

  it("takes a logo only as data, never as a path on the server", async () => {
    const response = await putStyle("oauth", { logo: { light: { path: "/etc/hosts" } } });
    expect(response.status).toBe(400);
    expect((await response.json()).errors[0].path).toMatch(/^logo\.light/);
  });

  it("writes a broken config.json again from the change, and says so", async () => {
    writeFileSync(configFile(), "{ not json");
    const response = await putStyle("oauth", { config: { font: "manrope" } });
    expect(response.status).toBe(200);
    expect((await response.json()).warnings).toEqual([
      "config.json was broken, so it was started again from these settings",
    ]);
    expect(configOnDisk()).toEqual({ font: "manrope" });
  });

  it("answers 404 for a project that does not exist", async () => {
    expect((await putStyle("nope", { config: {} })).status).toBe(404);
    expect((await app.request("/api/projects/nope/logo")).status).toBe(404);
  });
});

describe("GET /api/projects/:slug/logo", () => {
  it("is null when the config has no logo", async () => {
    const response = await app.request("/api/projects/oauth/logo");
    expect(await response.json()).toEqual({ logo: null });
  });
});

describe("GET /api/fonts/*", () => {
  it("serves the bundled fonts for the preview", async () => {
    const response = await app.request("/api/fonts/inter/inter-latin-wght-normal.woff2");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("font/woff2");
  });

  it("serves nothing outside the fonts folder", async () => {
    for (const path of ["../../package.json", "..%2F..%2Fpackage.json", "inter/missing.woff2"])
      expect((await app.request(`/api/fonts/${path}`)).status, path).toBe(404);
  });
});
