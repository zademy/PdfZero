import { describe, expect, it } from "vitest";
import { stripMarkdownFences } from "./ocrFormat.js";

describe("stripMarkdownFences", () => {
  it("strips a full ```markdown fence wrapper", () => {
    const md = "# Heading\n\nParagraph.";
    expect(stripMarkdownFences("```markdown\n" + md + "\n```")).toBe(md);
  });

  it("strips bare fences", () => {
    const md = "## Only heading";
    expect(stripMarkdownFences("```\n" + md + "\n```")).toBe(md);
  });

  it("leaves fenced code blocks inside the content intact", () => {
    const md = "Intro\n\n```js\nconst x = 1;\n```";
    expect(stripMarkdownFences(md)).toBe(md);
  });

  it("handles empty and whitespace input", () => {
    expect(stripMarkdownFences("")).toBe("");
    expect(stripMarkdownFences("  \n``` \n  ")).toBe("");
  });
});
