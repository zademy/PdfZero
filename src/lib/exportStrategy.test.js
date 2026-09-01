import { describe, expect, it } from "vitest";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, decodePDFRawStream } from "pdf-lib";
import { resolveFont, exportVectorPdf } from "./pdfExporter.js";

// Headless coverage for the hoisted 3-tier resolver and the underline fix.
// Embedded-font tier needs a loaded pdfjs doc (browser-only), so we cover the
// std-14 tier directly and the custom/underline tiers through a full vector
// export with a minimal PDF.

const MIN_PDF = () => {
  // Smallest valid 1-page PDF with a Helvetica font resource.
  const parts = [
    "%PDF-1.4\n",
    "1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n",
    "2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n",
    "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>endobj\n",
    "4 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n",
    "5 0 obj<< /Length 44 >>stream\nBT /F1 12 Tf 72 720 Td (base) Tj ET\nendstream endobj\n",
    "trailer<< /Root 1 0 R >>",
  ];
  return new TextEncoder().encode(parts.join(""));
};

describe("resolveFont — hoisted 3-tier resolver", () => {
  it("resolves a std-14 font for plain blocks and caches it", async () => {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const cache = {};

    const f1 = await resolveFont(
      doc,
      cache,
      { fontName: "Helvetica" },
      1,
      "abc",
    );
    const f2 = await resolveFont(
      doc,
      cache,
      { fontName: "Helvetica" },
      1,
      "abc",
    );

    expect(f1).toBe(f2); // cached under one key
    expect(typeof f1.encodeText).toBe("function");
    expect(cache).toHaveProperty("Helvetica");
  });

  it("falls through to std-14 when the custom tier has no asset", async () => {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    // Lato has a registry family but no fetchable asset in Node: must fall
    // through to a standard font instead of throwing.
    const font = await resolveFont(
      doc,
      {},
      { fontName: "Lato", fontSize: 12 },
      1,
      "Hola",
    );
    expect(typeof font.encodeText).toBe("function");
  });
});

describe("exportVectorPdf — underline survives export", () => {
  it("draws a line operator for underlined blocks (and still saves)", async () => {
    const block = {
      id: "u1",
      str: "underlined text",
      x: 72,
      y: 720,
      width: 200,
      height: 14,
      fontSize: 12,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontName: "Helvetica",
      color: "#000000",
      fontUnderline: true,
    };
    const bytes = await exportVectorPdf(
      MIN_PDF(),
      { 1: { texts: [block], annotations: [] } },
      1,
      { 1: "#ffffff" },
      { 1: {} },
    );

    // save() flates the content streams — decode back to inspect operators.
    // drawLine emits a stroked path (m/l ... S) present only because of the
    // underline block.
    const out = await PDFDocument.load(bytes);
    const contents = out.context.lookup(out.getPage(0).node.Contents());
    const streams = contents.asArray ? contents.asArray() : [contents];
    const decoded = streams
      .map((ref) => out.context.lookup(ref))
      .map((obj) =>
        new TextDecoder("latin1").decode(decodePDFRawStream(obj).decode()),
      )
      .join("");

    expect(decoded).toMatch(/RG/); // stroke color set (underline uses text color)
    expect(decoded).toMatch(/\bS\b/); // stroke operator drew the underline
  });
});
