import { describe, expect, it } from "vitest";
import { buildOcrRequestBody, sanitizeOcrText } from "./ollamaOcr.js";

describe("sanitizeOcrText", () => {
  it("collapses the observed glm-ocr repetition loop (fenced block ×10)", () => {
    const block = "Hola mundo, esta es una prueba de traducción. [editado]";
    const fenced = "```markdown\n" + block + "\n```";
    const looped = Array.from({ length: 10 }, () => fenced).join("\n\n");
    expect(sanitizeOcrText(looped)).toBe(block);
  });

  it("collapses consecutive duplicate paragraphs without fences", () => {
    const para = "Same paragraph repeated.";
    expect(sanitizeOcrText(`${para}\n\n${para}\n\n${para}`)).toBe(para);
  });

  it("keeps non-consecutive repeats (genuine recurring content)", () => {
    const text = "Header\n\nBody A\n\nHeader\n\nBody B";
    expect(sanitizeOcrText(text)).toBe(text);
  });

  it("keeps distinct blocks and paragraph structure", () => {
    const text = "First paragraph.\n\nSecond paragraph.\n\nThird one.";
    expect(sanitizeOcrText(text)).toBe(text);
  });

  it("normalizes CRLF and strips stray fence lines", () => {
    expect(sanitizeOcrText("```\r\nline one\r\n```\r\n\r\nline two")).toBe(
      "line one\n\nline two",
    );
  });

  it("returns empty string for empty/whitespace input", () => {
    expect(sanitizeOcrText("")).toBe("");
    expect(sanitizeOcrText("   \n\n  ")).toBe("");
  });
});

describe("buildOcrRequestBody", () => {
  it("targets the model with a raw ocr prompt and sane options", () => {
    const body = buildOcrRequestBody("glm-ocr:latest", "aGVsbG8=");
    expect(body.model).toBe("glm-ocr:latest");
    expect(body.prompt).toBe("ocr");
    expect(body.images).toEqual(["aGVsbG8="]);
    expect(body.stream).toBe(false);
    expect(body.think).toBe(false);
    expect(body.options.temperature).toBe(0);
    expect(body.options.repeat_penalty).toBeGreaterThan(1);
    expect(body.options.num_predict).toBeLessThan(8192);
  });
});
