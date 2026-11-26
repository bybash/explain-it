import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "./Markdown.tsx";

const html = (text: string) => renderToStaticMarkup(createElement(Markdown, { text }));

describe("Markdown", () => {
  it("shows what the assistant writes: bold, lists, headings, code and tables", () => {
    expect(html("**1 · Forward pass**\n- **The hook:** a question\n- the rest")).toMatch(
      /<strong>1 · Forward pass<\/strong>[\s\S]*<ul[\s\S]*<li[\s\S]*<strong>The hook:<\/strong> a question/,
    );
    expect(html("# Story")).toMatch(/<h3>Story<\/h3>/);
    expect(html("`graph.json`")).toMatch(/<code[^>]*>graph\.json<\/code>/);
    expect(html("| a | b |\n|---|---|\n| 1 | 2 |")).toMatch(/<table[\s\S]*<td[^>]*>1<\/td>/);
  });

  it("shows HTML as the text it is, so a reply adds nothing to the page", () => {
    const out = html('<img src=x onerror="alert(1)"><script>alert(2)</script> hi');
    expect(out).not.toMatch(/<img|<script/);
    expect(out).toContain("hi");
    // What the user types is not lost for looking like a tag.
    expect(html("Use List<User> here")).toContain("List&lt;User&gt;");
  });

  it("opens links apart from the app, and none that runs code", () => {
    expect(html("[docs](https://example.com)")).toMatch(
      /<a[^>]*href="https:\/\/example\.com"[^>]*target="_blank"[^>]*rel="noreferrer"/,
    );
    expect(html("[x](javascript:alert(1))")).not.toContain("javascript:");
  });

  it("loads no image a reply names, which would tell another site that it was read", () => {
    expect(html("![pixel](https://example.com/p.png)")).not.toMatch(/<img|p\.png/);
  });
});
