import { describe, expect, it, vi } from "vitest";
import {
  FORMAT_FAILED_NOTE,
  assembleOcrDocument,
  deriveFallbackTitle,
  formatWithRetry,
} from "./ocrDocument.js";

describe("assembleOcrDocument", () => {
  it("joins pages as '---' + page heading, first page without leading separator", () => {
    const { markdown, partialFormat } = assembleOcrDocument([
      { page: 1, raw: "raw one", markdown: "# Heading one\n\nbody" },
      { page: 2, raw: "raw two", markdown: "## Heading two\n\nbody" },
    ]);

    expect(markdown).toBe(
      "## Page 1\n\n# Heading one\n\nbody\n\n---\n\n## Page 2\n\n## Heading two\n\nbody",
    );
    expect(partialFormat).toBe(false);
  });

  it("renders failed pages as raw text plus the visible note, and keeps later pages", () => {
    const { markdown, partialFormat } = assembleOcrDocument([
      { page: 1, raw: "plain one", markdown: null },
      { page: 2, raw: "raw two", markdown: "formatted two" },
    ]);

    expect(markdown).toBe(
      "## Page 1\n\nplain one\n\n" +
        FORMAT_FAILED_NOTE +
        "\n\n---\n\n## Page 2\n\nformatted two",
    );
    expect(partialFormat).toBe(true);
  });

  it("marks all-failed documents as partial too", () => {
    const { partialFormat } = assembleOcrDocument([
      { page: 1, raw: "a", markdown: null },
    ]);
    expect(partialFormat).toBe(true);
  });

  it("skips pages with no content at all, preserving real page numbers", () => {
    const { markdown } = assembleOcrDocument([
      { page: 1, raw: "kept", markdown: "md one" },
      { page: 2, raw: "   ", markdown: null },
      { page: 3, raw: "kept too", markdown: "md three" },
    ]);

    expect(markdown).not.toContain("Page 2");
    expect(markdown).toContain("## Page 3");
  });

  it("treats an empty markdown string as a failed format", () => {
    const { markdown, partialFormat } = assembleOcrDocument([
      { page: 1, raw: "raw", markdown: "  " },
    ]);

    expect(markdown).toContain("raw");
    expect(markdown).toContain(FORMAT_FAILED_NOTE);
    expect(partialFormat).toBe(true);
  });

  it("returns an empty document for no usable pages", () => {
    expect(assembleOcrDocument([])).toEqual({
      markdown: "",
      partialFormat: false,
    });
  });
});

describe("deriveFallbackTitle", () => {
  it("prefers the first content heading, stripping markdown marks", () => {
    const doc = "## Page 1\n\n# **The Art of** Reading\n\nbody";
    expect(deriveFallbackTitle(doc)).toBe("The Art of Reading");
  });

  it("falls back to the first non-empty line when no heading exists", () => {
    const doc = "## Page 1\n\n---\n\nJust a plain first line here";
    expect(deriveFallbackTitle(doc)).toBe("Just a plain first line here");
  });

  it("truncates to at most six words", () => {
    const doc = "## Page 1\n\nfirst words of a much longer line follows";
    expect(deriveFallbackTitle(doc)).toBe("first words of a much longer");
  });

  it("ignores page headings, separators and the format-failed note", () => {
    const doc =
      "## Page 1\n\n" +
      FORMAT_FAILED_NOTE +
      "\n\n---\n\n## Page 2\n\n# Real Title";
    expect(deriveFallbackTitle(doc)).toBe("Real Title");
  });

  it("returns an empty string when there is nothing to derive from", () => {
    expect(deriveFallbackTitle("")).toBe("");
    expect(deriveFallbackTitle("## Page 1\n\n---\n\n## Page 2")).toBe("");
  });
});

describe("formatWithRetry", () => {
  it("returns the markdown on the first success without extra attempts", async () => {
    const formatter = vi.fn(async () => ({ ok: true, markdown: "# ok" }));

    await expect(formatWithRetry("raw", formatter)).resolves.toBe("# ok");
    expect(formatter).toHaveBeenCalledTimes(1);
  });

  it("retries twice after failures and succeeds on the third attempt", async () => {
    const formatter = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, code: "API_ERROR" })
      .mockResolvedValueOnce({ ok: false, code: "NETWORK" })
      .mockResolvedValueOnce({ ok: true, markdown: "# third" });

    await expect(formatWithRetry("raw", formatter)).resolves.toBe("# third");
    expect(formatter).toHaveBeenCalledTimes(3);
  });

  it("gives up after three failures and returns null", async () => {
    const formatter = vi.fn(async () => ({ ok: false, code: "API_ERROR" }));

    await expect(formatWithRetry("raw", formatter)).resolves.toBeNull();
    expect(formatter).toHaveBeenCalledTimes(3);
  });

  it("treats a rejecting formatter as a retryable failure", async () => {
    const formatter = vi
      .fn()
      .mockRejectedValueOnce(new Error("net down"))
      .mockResolvedValueOnce({ ok: true, markdown: "recovered" });

    await expect(formatWithRetry("raw", formatter)).resolves.toBe("recovered");
  });

  it("treats ok:true with empty markdown as a failure", async () => {
    const formatter = vi.fn(async () => ({ ok: true, markdown: "   " }));

    await expect(formatWithRetry("raw", formatter)).resolves.toBeNull();
    expect(formatter).toHaveBeenCalledTimes(3);
  });
});
