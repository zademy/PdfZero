import { describe, it, expect } from "vitest";
import { markdownToPlainText } from "./markdownText.js";

describe("markdownToPlainText", () => {
  it("unwraps headings into plain text", () => {
    expect(markdownToPlainText("## Page 1\n\n# Title")).toBe("Page 1\n\nTitle");
  });

  it("strips emphasis, code, highlight, strike, sup and sub markers", () => {
    expect(
      markdownToPlainText(
        "**bold** and *it* and `code` and ==hl== and ~~gone~~ and ^up^ and x~2~",
      ),
    ).toBe("bold and it and code and hl and gone and up and x2");
  });

  it("keeps link text and image alt text, drops the targets", () => {
    expect(
      markdownToPlainText(
        "see [the docs](https://x.dev) and ![a chart](data:image/png;base64,AAA)",
      ),
    ).toBe("see the docs and a chart");
  });

  it("drops list markers but keeps the items", () => {
    expect(markdownToPlainText("- one\n* two\n3. three")).toBe(
      "one\ntwo\nthree",
    );
  });

  it("unwraps blockquotes so fallback notes read as text", () => {
    expect(
      markdownToPlainText("> No se pudo generar el formato de esta página."),
    ).toBe("No se pudo generar el formato de esta página.");
  });

  it("keeps fenced code content but drops the fences", () => {
    expect(
      markdownToPlainText("before\n\n```js\nconst a = 1;\n```\n\nafter"),
    ).toBe("before\n\nconst a = 1;\n\nafter");
  });

  it("drops admonition fences but keeps their content", () => {
    expect(markdownToPlainText(":::note\nPay attention\n:::\n")).toBe(
      "Pay attention",
    );
  });

  it("drops frontmatter entirely", () => {
    expect(markdownToPlainText("---\ntitle: doc\n---\n\n# Body\n\nText")).toBe(
      "Body\n\nText",
    );
  });

  it("drops thematic breaks", () => {
    expect(markdownToPlainText("a\n\n---\n\nb")).toBe("a\n\nb");
  });

  it("flattens an assembled OCR document shape", () => {
    const doc = [
      "## Page 1",
      "# Invoice",
      "**Total:** 42",
      "",
      "---",
      "",
      "## Page 2",
      "> No se pudo generar el formato de esta página.",
      "raw text",
    ].join("\n");
    expect(markdownToPlainText(doc)).toBe(
      [
        "Page 1",
        "Invoice",
        "Total: 42",
        "",
        "Page 2",
        "No se pudo generar el formato de esta página.",
        "raw text",
      ].join("\n"),
    );
  });

  it("collapses runs of blank lines and tolerates empty input", () => {
    expect(markdownToPlainText("a\n\n\n\nb")).toBe("a\n\nb");
    expect(markdownToPlainText("")).toBe("");
    expect(markdownToPlainText(null)).toBe("");
  });
});
