import { describe, expect, it } from "vitest";
import { BLOCK_LABELS, cleanOcrText, labelBlocks } from "./ocrBlocks.js";

describe("labelBlocks", () => {
  it("labels every duplicate after the first as echo, the rest as content", () => {
    const labeled = labelBlocks("A\n\nA\n\nB\n\nA");
    expect(labeled).toEqual([
      { text: "A", label: "content" },
      { text: "A", label: "echo" },
      { text: "B", label: "content" },
      { text: "A", label: "content" }, // non-consecutive repeat is genuine
    ]);
  });

  it("exposes the dictionary with an action per label", () => {
    expect(BLOCK_LABELS.echo.action).toBe("drop");
    expect(BLOCK_LABELS.content.action).toBe("keep");
  });

  it("returns [] for empty/whitespace input", () => {
    expect(labelBlocks("")).toEqual([]);
    expect(labelBlocks("  \n\n  ")).toEqual([]);
  });
});

describe("cleanOcrText", () => {
  it("collapses the observed glm-ocr repetition loop (fenced block ×10)", () => {
    const block = "Hola mundo, esta es una prueba de traducción. [editado]";
    const fenced = "```markdown\n" + block + "\n```";
    const looped = Array.from({ length: 10 }, () => fenced).join("\n\n");
    expect(cleanOcrText(looped)).toBe(block);
  });

  it("keeps non-consecutive repeats (genuine recurring content)", () => {
    const text = "Header\n\nBody A\n\nHeader\n\nBody B";
    expect(cleanOcrText(text)).toBe(text);
  });

  it("keeps distinct blocks and paragraph structure", () => {
    const text = "First paragraph.\n\nSecond paragraph.\n\nThird one.";
    expect(cleanOcrText(text)).toBe(text);
  });

  it("normalizes CRLF and strips stray fence lines", () => {
    expect(cleanOcrText("```\r\nline one\r\n```\r\n\r\nline two")).toBe(
      "line one\n\nline two",
    );
  });

  it("returns empty string for empty/whitespace input", () => {
    expect(cleanOcrText("")).toBe("");
    expect(cleanOcrText("   \n\n  ")).toBe("");
  });
});
