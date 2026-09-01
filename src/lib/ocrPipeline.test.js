import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./pdfRenderer.js", () => ({
  renderPage: vi.fn(async () => ({ canvas: { fake: true } })),
}));
vi.mock("./ollamaOcr.js", () => ({
  detectOllama: vi.fn(),
  ollamaOcrCanvas: vi.fn(),
}));
vi.mock("./ocrEngine.js", () => ({
  ocrCanvas: vi.fn(),
  terminateOcr: vi.fn(async () => {}),
}));
vi.mock("./ocrFormat.js", () => ({
  formatOcrMarkdown: vi.fn(),
}));
vi.mock("./translation.js", () => ({
  getGlmApiKey: vi.fn(),
}));

const { detectOllama, ollamaOcrCanvas } = await import("./ollamaOcr.js");
const { ocrCanvas, terminateOcr } = await import("./ocrEngine.js");
const { formatOcrMarkdown } = await import("./ocrFormat.js");
const { getGlmApiKey } = await import("./translation.js");
const { ocrPage } = await import("./ocrPipeline.js");

describe("ocrPage — the whole OCR flow behind one function", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getGlmApiKey.mockReturnValue(null);
    formatOcrMarkdown.mockResolvedValue({ ok: true, markdown: "# md" });
  });

  it("prefers Ollama and cleans its raw blocks onto raw", async () => {
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
    expect(ocrCanvas).not.toHaveBeenCalled();
  });

  it("falls back to tesseract when Ollama fails, normalizing words[] to text", async () => {
    detectOllama.mockResolvedValue({ model: "glm-ocr:latest" });
    ollamaOcrCanvas.mockRejectedValue(new Error("boom"));
    ocrCanvas.mockImplementation(async (_c, onP) => {
      if (onP) onP(42);
      return [{ str: "one" }, { str: "two" }];
    });
    const progress = [];

    const r = await ocrPage(1, { onProgress: (p) => progress.push(p) });

    expect(r.engine).toBe("tesseract.js");
    expect(r.raw).toBe("one two");
    expect(progress).toEqual([42]);
  });

  it("uses tesseract directly when Ollama is not installed", async () => {
    detectOllama.mockResolvedValue(null);
    ocrCanvas.mockResolvedValue([{ str: "solo" }]);

    const r = await ocrPage(1);

    expect(r).toEqual({ raw: "solo", markdown: null, engine: "tesseract.js" });
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

  it("always terminates the tesseract worker, even when OCR throws", async () => {
    detectOllama.mockResolvedValue(null);
    ocrCanvas.mockRejectedValue(new Error("engine died"));

    await expect(ocrPage(1)).rejects.toThrow("engine died");
    expect(terminateOcr).toHaveBeenCalledTimes(1);
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
