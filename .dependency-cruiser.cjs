// Module boundaries from AGENTS.md (Architecture). Run with `npm run deps`.
const CORE = "^src/(schema|layout|engine|mermaid|guidance|checks|share)/";
// checks/ holds the pure rules; the browser measures shapes in engine/shapes.ts and render/check.ts.
const SHELL = "^src/(server|mcp|render|audio|llm|cli|web)/";
const TEST = "\\.test\\.ts$";
const TEST_SUPPORT = "\\.(test|testing)\\.ts$";

module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "Circular imports make modules impossible to understand or test alone.",
      from: {},
      to: { circular: true },
    },
    {
      name: "core-is-pure",
      severity: "error",
      comment: "Core modules do no input or output, so they cannot use Node built-ins.",
      from: { path: CORE, pathNot: TEST },
      to: { dependencyTypes: ["core"] },
    },
    {
      name: "core-does-not-call-shell",
      severity: "error",
      comment: "The shell calls the core; the core never calls the shell.",
      from: { path: CORE },
      to: { path: SHELL },
    },
    {
      name: "web-talks-to-the-api",
      severity: "error",
      comment: "The web app talks to the server over HTTP, never by import.",
      from: { path: "^src/web/" },
      to: { path: "^src/server/" },
    },
    {
      name: "only-llm-uses-the-ai-sdk",
      severity: "error",
      comment: "Only src/llm talks to an LLM.",
      from: { pathNot: "^src/llm/" },
      to: { path: "node_modules/(ai|@ai-sdk/[^/]+|@openrouter/[^/]+)/" },
    },
    {
      name: "no-dev-dependencies-in-production-code",
      severity: "error",
      comment: "Test tools such as fast-check stay in tests.",
      from: { path: "^src/", pathNot: TEST },
      to: { dependencyTypes: ["npm-dev"] },
    },
    {
      name: "no-imports-from-tests",
      severity: "error",
      comment: "Tests and their support files (*.testing.ts) stay out of production code.",
      from: { pathNot: TEST_SUPPORT },
      to: { path: TEST_SUPPORT },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    // TypeScript 7 has no compiler API that dependency-cruiser can use, so parse with swc.
    parser: "swc",
    enhancedResolveOptions: { extensions: [".ts", ".tsx", ".js"] },
  },
};
