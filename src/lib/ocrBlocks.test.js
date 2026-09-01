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

  it("drops a final block that is a truncated prefix of the previous kept block", () => {
    const block = "The quick brown fox jumps over the lazy dog again.";
    const truncated = block.slice(0, 20); // generation cap cut mid-repeat
    expect(cleanOcrText(`${block}\n\n${truncated}`)).toBe(block);
  });

  it("labels the truncated final block as echo", () => {
    const labeled = labelBlocks(
      "Full block that is long enough.\n\nFull block ",
    );
    const last = labeled[labeled.length - 1];
    expect(last.label).toBe("echo");
  });

  it("keeps a short final block that happens to be a prefix (< threshold)", () => {
    const block = "Section heading text that is long.";
    const text = `${block}\n\n${block.slice(0, 9)}`;
    expect(cleanOcrText(text)).toBe(text);
  });

  it("drops at exactly the 10-char prefix threshold", () => {
    const block = "A sufficiently long block of text here.";
    expect(cleanOcrText(`${block}\n\n${block.slice(0, 10)}`)).toBe(block);
  });

  it("collapses a run of identical consecutive lines inside a block", () => {
    const block = "First line.\nFirst line.\nFirst line.\nSecond line.";
    expect(cleanOcrText(block)).toBe("First line.\nSecond line.");
  });

  it("keeps a line that repeats non-consecutively inside a block", () => {
    const block = "Intro.\nBody.\nIntro.";
    expect(cleanOcrText(block)).toBe(block);
  });

  it("is idempotent: cleaning twice equals cleaning once", () => {
    const block = "The quick brown fox jumps over the lazy dog again.";
    const dirty = `${block}\n\n${block}\n\n${block.slice(0, 25)}`;
    const once = cleanOcrText(dirty);
    expect(cleanOcrText(once)).toBe(once);
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
