import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./pdfRenderer.js", () => ({
  renderPage: vi.fn(async () => ({ canvas: { fake: true } })),
}));
vi.mock("./ollamaOcr.js", () => ({
  detectOllama: vi.fn(),
  ollamaOcrCanvas: vi.fn(),
}));
vi.mock("./ocrFormat.js", () => ({
  formatOcrMarkdown: vi.fn(),
}));
vi.mock("./translation.js", () => ({
  getGlmApiKey: vi.fn(),
}));

const { detectOllama, ollamaOcrCanvas } = await import("./ollamaOcr.js");
const { formatOcrMarkdown } = await import("./ocrFormat.js");
const { getGlmApiKey } = await import("./translation.js");
const { ocrPage, OcrUnavailableError } = await import("./ocrPipeline.js");

describe("ocrPage — the whole OCR flow behind one function", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getGlmApiKey.mockReturnValue(null);
    formatOcrMarkdown.mockResolvedValue({ ok: true, markdown: "# md" });
  });

  it("runs Ollama and cleans its raw blocks onto raw", async () => {
    detectOllama.mockResolvedValue({ model: "glm-ocr:latest" });
    const block = "Hola mundo";
    const looped = Array.from({ length: 4 }, () => block).join("\n\n");
    ollamaOcrCanvas.mockResolvedValue(looped);

    const r = await ocrPage(2);

    expect(r).toEqual({
      raw: block,
      markdown: null,
      engine: "glm-ocr:latest",
    });
    expect(ollamaOcrCanvas).toHaveBeenCalledWith(
      expect.anything(),
      "glm-ocr:latest",
    );
  });

  it("rejects with OcrUnavailableError when Ollama or the model is missing", async () => {
    detectOllama.mockResolvedValue(null);

    await expect(ocrPage(1)).rejects.toBeInstanceOf(OcrUnavailableError);
    await expect(ocrPage(1)).rejects.toMatchObject({
      name: "OcrUnavailableError",
    });
    await expect(ocrPage(1)).rejects.toThrow(/ollama pull glm-ocr/);
    expect(ollamaOcrCanvas).not.toHaveBeenCalled();
  });

  it("propagates engine failures instead of degrading silently", async () => {
    detectOllama.mockResolvedValue({ model: "glm-ocr:latest" });
    ollamaOcrCanvas.mockRejectedValue(new Error("boom"));

    await expect(ocrPage(1)).rejects.toThrow("boom");
  });

  it("formats via GLM only when the key exists, and never throws on format failure", async () => {
    detectOllama.mockResolvedValue({ model: "glm-ocr:latest" });
    const block = "Hola mundo";
    ollamaOcrCanvas.mockResolvedValue(
      Array.from({ length: 4 }, () => block).join("\n\n"),
    );

    getGlmApiKey.mockReturnValue("k");
    const ok = await ocrPage(1);
    expect(ok.markdown).toBe("# md");
    // The formatter sees the cleaned text, not the engine's raw echo.
    expect(formatOcrMarkdown).toHaveBeenCalledWith(block);

    formatOcrMarkdown.mockRejectedValue(new Error("net down"));
    const fail = await ocrPage(1);
    expect(fail.markdown).toBeNull();
  });

  it("skips GLM formatting when format is false", async () => {
    detectOllama.mockResolvedValue({ model: "glm-ocr:latest" });
    ollamaOcrCanvas.mockResolvedValue("Hola mundo.");
    getGlmApiKey.mockReturnValue("k");

    const r = await ocrPage(1, { format: false });

    expect(r).toEqual({
      raw: "Hola mundo.",
      markdown: null,
      engine: "glm-ocr:latest",
    });
    expect(formatOcrMarkdown).not.toHaveBeenCalled();
  });

  it("reports stages so the UI can label toasts", async () => {
    detectOllama.mockResolvedValue({ model: "glm-ocr:latest" });
    ollamaOcrCanvas.mockResolvedValue("x");
    getGlmApiKey.mockReturnValue("k");
    const stages = [];

    await ocrPage(1, { onStage: (s, d) => stages.push(d ? `${s}:${d}` : s) });

    expect(stages).toEqual([
      "render",
      "detect",
      "ollama:glm-ocr:latest",
      "format",
    ]);
  });
});
