import {
  PDFDocument,
  rgb,
  StandardFonts,
  degrees,
  pushGraphicsState,
  popGraphicsState,
  beginText,
  endText,
  setFillingColor,
  setFontAndSize,
  setTextMatrix,
  setCharacterSpacing,
  setWordSpacing,
  setCharacterSqueeze,
  setTextRenderingMode,
  showText,
} from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import fontkit from "@pdf-lib/fontkit";
import { encryptPDF } from "@pdfsmaller/pdf-encrypt";
import {
  BASE_SCALE,
  classifyFont,
  getEmbeddedFontData,
} from "./pdfRenderer.js";
import {
  layoutTextForBlock,
  splitTextLines,
  textChars,
} from "./pdfTextLayout.js";

pdfjsLib.GlobalWorkerOptions.workerSrc ||= new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

// ─── Color ────────────────────────────────────────────────────────────────
function hexToRgb(hex) {
  if (!hex || hex === "transparent") return rgb(0, 0, 0);
  const c = hex.replace("#", "").padEnd(6, "0");
  return rgb(
    parseInt(c.slice(0, 2), 16) / 255,
    parseInt(c.slice(2, 4), 16) / 255,
    parseInt(c.slice(4, 6), 16) / 255,
  );
}

// ─── Font picker ──────────────────────────────────────────────────────────
// pdf-lib's built-in path only has the 14 standard fonts. This is a browser
// fallback, not high-fidelity font preservation; the advanced engine should
// reuse embedded fonts or embed measured substitutes whenever possible.
function pickStdFont(block) {
  // Prefer pre-classified info if present
  const info = classifyFont(block.fontName || block.stdFont || "");
  const family = block.stdFont || info.family;
  const bold = block.fontBold ?? info.bold;
  const italic = block.fontItalic ?? info.italic;

  if (family === "Courier") {
    if (bold && italic) return StandardFonts.CourierBoldOblique;
    if (bold) return StandardFonts.CourierBold;
    if (italic) return StandardFonts.CourierOblique;
    return StandardFonts.Courier;
  }
  if (family === "Times-Roman") {
    if (bold && italic) return StandardFonts.TimesRomanBoldItalic;
    if (bold) return StandardFonts.TimesRomanBold;
    if (italic) return StandardFonts.TimesRomanItalic;
    return StandardFonts.TimesRoman;
  }
  // Everything else → Helvetica family
  if (bold && italic) return StandardFonts.HelveticaBoldOblique;
  if (bold) return StandardFonts.HelveticaBold;
  if (italic) return StandardFonts.HelveticaOblique;
  return StandardFonts.Helvetica;
}

// ─── Coordinate conversion ────────────────────────────────────────────────
// Canvas coords (BASE_SCALE px, top-left origin)
//   → PDF user-space points (bottom-left origin)
//
// Derivation:
//   cy = top of glyph in canvas px
//   baseline_canvas = cy + fontSize_canvas * 1.0  (CSS lineHeight=1.25, baseline at ~80% → matches tx[5])
//   baseline_pts = baseline_canvas / BASE_SCALE
//   pdf_y = pageHeight_pts - baseline_pts
function canvasToPdf(cx, cy, cFontSize, pageH, cBaselineOffset) {
  const x = cx / BASE_SCALE;
  const size = Math.max(cFontSize / BASE_SCALE, 1);
  const baseline = (cy + (cBaselineOffset ?? cFontSize * 0.8)) / BASE_SCALE;
  const y = pageH - baseline;
  return { x, y, size };
}

const pageFontKeyCache = new WeakMap();

function getPageFontKey(page, font) {
  let pageCache = pageFontKeyCache.get(page);
  if (!pageCache) {
    pageCache = new Map();
    pageFontKeyCache.set(page, pageCache);
  }

  const ref = font?.ref;
  const key = `${font?.name || "font"}:${ref?.objectNumber ?? ""}:${ref?.generationNumber ?? ""}`;
  if (!pageCache.has(key)) {
    pageCache.set(key, page.node.newFontDictionary(font.name, font.ref));
  }
  return pageCache.get(key);
}

function normalizeHorizontalScale(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 100;
  return n <= 10 ? n * 100 : n;
}

function fontSupportsText(font, text) {
  try {
    const supported = new Set(font.getCharacterSet?.() || []);
    if (!supported.size) return false;

    for (const ch of textChars(text)) {
      if (ch === "\n" || ch === "\r" || ch === "\t") continue;
      if (!supported.has(ch.codePointAt(0))) return false;
    }

    return true;
  } catch {
    return false;
  }
}

function drawVectorTextLine(page, text, options, block, spacing = 0) {
  const encoded = options.font.encodeText(text);
  const fontKey = getPageFontKey(page, options.font);
  const angle = ((Number(block.rotation) || 0) * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const charSpacing = (Number(block.charSpacing) || 0) + (Number(spacing) || 0);
  const wordSpacing = Number(block.wordSpacing) || 0;
  const horizontalScale = normalizeHorizontalScale(block.horizontalScale);
  const renderingMode = Number.isFinite(Number(block.textRenderingMode))
    ? Number(block.textRenderingMode)
    : 0;

  page.pushOperators(
    pushGraphicsState(),
    beginText(),
    setFillingColor(options.color),
    setFontAndSize(fontKey, options.size),
    setCharacterSpacing(charSpacing),
    setWordSpacing(wordSpacing),
    setCharacterSqueeze(horizontalScale),
    setTextRenderingMode(renderingMode),
    setTextMatrix(cos, sin, -sin, cos, options.x, options.y),
    showText(encoded),
    endText(),
    popGraphicsState(),
  );
}

function drawLineWithSpacing(page, text, options, spacing = 0, block = {}) {
  const chars = textChars(text);
  if (!chars.length) return;

  try {
    drawVectorTextLine(page, text, options, block, spacing);
    return;
  } catch (_) {
    // Fall back to pdf-lib's public drawText path for fonts that cannot encode
    // the edited string. The caller will retry with Helvetica if this also fails.
    if (!spacing) {
      page.drawText(text, options);
      return;
    }
  }

  let cursorX = options.x;
  for (const ch of chars) {
    if (ch !== " ") page.drawText(ch, { ...options, x: cursorX });
    cursorX += options.font.widthOfTextAtSize(ch, options.size) + spacing;
  }
}

function drawFittedText(page, text, options, block) {
  const preserveWidth = Boolean(block.isEdited && block.originalWidth);
  const explicitLines = splitTextLines(text);
  const layout = layoutTextForBlock({
    block,
    text,
    font: options.font,
    size: options.size,
    baseScale: BASE_SCALE,
    preserveWidth,
  });

  layout.lines.forEach((line, index) => {
    const y = options.y - index * layout.lineHeight;
    const lineOptions = { ...options, y, size: line.size };
    if (!explicitLines[index]?.length) return;
    drawLineWithSpacing(
      page,
      line.text,
      lineOptions,
      line.characterSpacing,
      block,
    );
  });

  return {
    status: layout.status,
    overflow: layout.overflow,
    lineCount: layout.lines.length,
  };
}

// ─── Whiteout helpers ─────────────────────────────────────────────────────
function whiteoutBlock(page, block, pageH, bgRgb) {
  const source = {
    x: block.originalX ?? block.x,
    y: block.originalY ?? block.y,
    width: block.originalWidth ?? block.width,
    height: block.originalHeight ?? block.height,
    fontSize: block.originalFontSize ?? block.fontSize ?? 12,
    baselineOffset: block.originalBaselineOffset ?? block.baselineOffset,
  };
  const { x, y, size } = canvasToPdf(
    source.x,
    source.y,
    source.fontSize,
    pageH,
    source.baselineOffset,
  );
  const w = (source.width || source.fontSize * 6) / BASE_SCALE + 6;
  const h = (source.height || source.fontSize) / BASE_SCALE + 2;
  page.drawRectangle({
    x: x - 2,
    y: y - size * 0.2,
    width: w,
    height: h + size * 0.2,
    color: bgRgb,
  });
}

function parseRgbString(str) {
  if (!str) return rgb(1, 1, 1);
  const m = str.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) return rgb(+m[1] / 255, +m[2] / 255, +m[3] / 255);
  return rgb(1, 1, 1);
}

function rgbArrayToCss([r, g, b]) {
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

function sampleCanvasBg(
  ctx,
  canvas,
  x,
  y,
  w,
  h,
  fallback = "rgb(255,255,255)",
) {
  try {
    const pts = [];
    const offset = 2;
    const step = Math.max(Math.round(Math.min(w, h, 10) / 2), 2);
    for (let px = x; px <= x + w; px += step) {
      pts.push([px, y - offset], [px, y + h + offset]);
    }
    for (let py = y; py <= y + h; py += step) {
      pts.push([x - offset, py], [x + w + offset, py]);
    }

    const colors = pts
      .map(([px, py]) => [Math.round(px), Math.round(py)])
      .filter(
        ([px, py]) =>
          px >= 0 && py >= 0 && px < canvas.width && py < canvas.height,
      )
      .map(([px, py]) => [...ctx.getImageData(px, py, 1, 1).data].slice(0, 3));

    if (!colors.length) return fallback;
    const median = (idx) => {
      const sorted = colors.map((c) => c[idx]).sort((a, b) => a - b);
      return sorted[sorted.length >> 1];
    };
    return rgbArrayToCss([median(0), median(1), median(2)]);
  } catch {
    return fallback;
  }
}

function normalizeWatermarkFamily(fontFamily = "Helvetica") {
  const raw = String(fontFamily || "Helvetica").toLowerCase();
  if (raw.includes("times") || raw.includes("georgia") || raw.includes("serif"))
    return "Times-Roman";
  if (raw.includes("courier") || raw.includes("mono")) return "Courier";
  return "Helvetica";
}

function pickWatermarkFontName(
  fontFamily = "Helvetica",
  bold = false,
  italic = false,
) {
  const family = normalizeWatermarkFamily(fontFamily);
  if (family === "Courier") {
    if (bold && italic) return StandardFonts.CourierBoldOblique;
    if (bold) return StandardFonts.CourierBold;
    if (italic) return StandardFonts.CourierOblique;
    return StandardFonts.Courier;
  }
  if (family === "Times-Roman") {
    if (bold && italic) return StandardFonts.TimesRomanBoldItalic;
    if (bold) return StandardFonts.TimesRomanBold;
    if (italic) return StandardFonts.TimesRomanItalic;
    return StandardFonts.TimesRoman;
  }
  if (bold && italic) return StandardFonts.HelveticaBoldOblique;
  if (bold) return StandardFonts.HelveticaBold;
  if (italic) return StandardFonts.HelveticaOblique;
  return StandardFonts.Helvetica;
}

function normalizeWatermarkOptions(textOrOptions, maybeOptions = {}) {
  if (typeof textOrOptions === "string") {
    return {
      type: "text",
      text: textOrOptions,
      fontFamily: "Helvetica",
      bold: true,
      italic: false,
      color: "#737373",
      fontSize: 52,
      opacity: 0.13,
      rotation: -45,
      positionPreset: "center",
      offsetX: 0,
      offsetY: 0,
      tiled: false,
      imageScale: 28,
      targetPages: null,
      ...maybeOptions,
    };
  }

  const options = textOrOptions || {};
  return {
    type: options.type || (options.imageBytes ? "image" : "text"),
    text: options.text || "CONFIDENTIAL",
    fontFamily: options.fontFamily || "Helvetica",
    bold: options.bold ?? true,
    italic: options.italic ?? false,
    color: options.color || "#737373",
    fontSize: options.fontSize ?? 52,
    opacity: options.opacity ?? 0.13,
    rotation: options.rotation ?? -45,
    positionPreset: options.positionPreset || "center",
    offsetX: options.offsetX ?? 0,
    offsetY: options.offsetY ?? 0,
    tiled: options.tiled ?? false,
    imageBytes: options.imageBytes || null,
    imageType: options.imageType || "",
    imageScale: options.imageScale ?? 28,
    targetPages: options.targetPages || null,
  };
}

function normalizeInputToArrayBuffer(input) {
  if (input?.arrayBuffer) return input.arrayBuffer();
  return Promise.resolve(input);
}

function resolveTargetPages(totalPages, targetPages) {
  if (!Array.isArray(targetPages) || targetPages.length === 0) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  return [...new Set(targetPages.map(Number))]
    .filter((page) => Number.isFinite(page) && page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);
}

function getPresetPosition(
  preset,
  pageWidth,
  pageHeight,
  markWidth,
  markHeight,
  margin = 24,
) {
  switch (preset) {
    case "top-left":
      return { x: margin, y: margin };
    case "top-right":
      return { x: pageWidth - markWidth - margin, y: margin };
    case "bottom-left":
      return { x: margin, y: pageHeight - markHeight - margin };
    case "bottom-right":
      return {
        x: pageWidth - markWidth - margin,
        y: pageHeight - markHeight - margin,
      };
    case "top":
    case "top-center":
      return { x: (pageWidth - markWidth) / 2, y: margin };
    case "bottom":
    case "bottom-center":
      return {
        x: (pageWidth - markWidth) / 2,
        y: pageHeight - markHeight - margin,
      };
    case "center":
    default:
      return {
        x: (pageWidth - markWidth) / 2,
        y: (pageHeight - markHeight) / 2,
      };
  }
}

function buildWatermarkPlacements(
  pageWidth,
  pageHeight,
  markWidth,
  markHeight,
  options,
) {
  const offsetX = Number(options.offsetX) || 0;
  const offsetY = Number(options.offsetY) || 0;

  if (!options.tiled) {
    const base = getPresetPosition(
      options.positionPreset,
      pageWidth,
      pageHeight,
      markWidth,
      markHeight,
    );
    return [{ x: base.x + offsetX, y: base.y + offsetY }];
  }

  const stepX = markWidth + Math.max(markWidth * 0.65, 30);
  const stepY = markHeight + Math.max(markHeight * 0.9, 24);
  const startX = -markWidth * 0.4 + offsetX;
  const startY = -markHeight * 0.3 + offsetY;
  const placements = [];

  for (
    let row = 0, y = startY;
    y < pageHeight + markHeight;
    row += 1, y += stepY
  ) {
    const rowShift = row % 2 === 0 ? 0 : stepX / 2;
    for (let x = startX - rowShift; x < pageWidth + markWidth; x += stepX) {
      placements.push({ x, y });
    }
  }

  return placements;
}

// ─── Safe text encoding ────────────────────────────────────────────────────
// pdf-lib standard fonts only support WinAnsiEncoding (latin-1, chars 32-255).
// Anything outside that range must be stripped or substituted.
function sanitize(str) {
  return [...(str || "")]
    .map((ch) => {
      if (ch === "\n") return "\n";
      if (ch === "\t") return " ";
      const code = ch.charCodeAt(0);
      if (code >= 32 && code <= 255) return ch;
      // Common unicode → latin substitutions
      const subs = {
        "\u2018": "'",
        "\u2019": "'",
        "\u201C": '"',
        "\u201D": '"',
        "\u2013": "-",
        "\u2014": "-",
        "\u2026": "...",
        "\u00A0": " ",
        "\u00AD": "-",
        "\u2022": "*",
        "\u2212": "-",
        "\u00B7": ".",
      };
      return subs[ch] || "";
    })
    .join("");
}

function canvasToPngBytes(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error("Could not encode flattened page"));
        return;
      }
      resolve(await blob.arrayBuffer());
    }, "image/png");
  });
}

function drawVisualCover(ctx, canvas, block, scale, fallbackBg) {
  const fontSize = block.originalFontSize || block.fontSize || 12;
  const x = (block.originalX ?? block.x ?? 0) * scale;
  const y = (block.originalY ?? block.y ?? 0) * scale;
  const w = Math.max(
    (block.originalWidth || block.width || fontSize * 4) * scale,
    1,
  );
  const h = Math.max(
    (block.originalHeight || block.height || fontSize) * scale,
    1,
  );
  const bg = sampleCanvasBg(ctx, canvas, x, y, w, h, fallbackBg);
  const pad = 2 * scale;

  ctx.save();
  ctx.filter = `blur(${Math.max(1, scale)}px)`;
  ctx.fillStyle = bg;
  ctx.fillRect(x - 0.75 * scale, y - pad, w + pad * 2, h + pad * 2);
  ctx.restore();
}

function drawVisualText(ctx, block, scale) {
  const text = String(block.str || "");
  if (!text.trim()) return;

  const sourceSize = block.fontSize || 12;
  const fontSize = Math.max(sourceSize, 4) * scale;
  const weight = block.fontBold ? "700" : "400";
  const style = block.fontItalic ? "italic" : "normal";
  const family = block.fontFamily || "Arial, Helvetica, sans-serif";
  const baselineOffset = (block.baselineOffset ?? sourceSize * 0.8) * scale;
  const lineHeight =
    Math.max(block.lineHeight || block.height || sourceSize, sourceSize) *
    scale;
  const x = (block.x || 0) * scale;
  const y = (block.y || 0) * scale + baselineOffset;

  ctx.save();
  ctx.fillStyle = block.color || "#000000";
  ctx.font = `${style} ${weight} ${fontSize}px ${family}`;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  const angle = ((Number(block.rotation) || 0) * Math.PI) / 180;
  ctx.translate(x, y);
  if (angle) ctx.rotate(angle);

  splitTextLines(text).forEach((line, index) => {
    if (line) ctx.fillText(line, 0, index * lineHeight);
  });

  ctx.restore();
}

function drawVisualAnnotations(ctx, annotations, scale) {
  for (const ann of annotations || []) {
    const x = (ann.x || 0) * scale;
    const y = (ann.y || 0) * scale;
    const w = (ann.width || 0) * scale;
    const h = (ann.height || 0) * scale;

    ctx.save();
    if (ann.type === "highlight") {
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = "rgb(255,235,38)";
      ctx.fillRect(x, y, w, h);
    } else if (ann.type === "redact") {
      ctx.fillStyle = "#000000";
      ctx.fillRect(x, y, w, h);
    } else if (ann.type === "rect") {
      ctx.strokeStyle = ann.color || "#e84545";
      ctx.lineWidth = 1.5 * scale;
      ctx.strokeRect(x, y, w, h);
    }
    ctx.restore();
  }
}

function layerHasVisualEdits(layer) {
  if (!layer) return false;

  const hasTextEdits = (layer.texts || []).some((block) => {
    if (block?.isEdited) return true;
    return Boolean(String(block?.str || "").trim());
  });

  return hasTextEdits || Boolean((layer.annotations || []).length);
}

async function exportVisualPdf(
  originalArrayBuffer,
  editLayers,
  pageCount,
  pageBgs,
) {
  const requestedPageCount = Number(pageCount) || 0;
  const requestedEditedPages = new Set();

  for (let i = 1; i <= requestedPageCount; i++) {
    if (layerHasVisualEdits(editLayers?.[i])) requestedEditedPages.add(i);
  }

  if (!requestedEditedPages.size) {
    return new Uint8Array(originalArrayBuffer.slice(0));
  }

  const srcTask = pdfjsLib.getDocument({
    data: originalArrayBuffer.slice(0),
    fontExtraProperties: true,
  });
  const src = await srcTask.promise;
  const originalDoc = await PDFDocument.load(originalArrayBuffer.slice(0), {
    ignoreEncryption: true,
  });
  const out = await PDFDocument.create();
  const renderScale = 3;

  try {
    const totalPages = Math.min(
      requestedPageCount || src.numPages,
      src.numPages,
      originalDoc.getPageCount(),
    );
    const editedPages = new Set(
      [...requestedEditedPages].filter(
        (pageNum) => pageNum >= 1 && pageNum <= totalPages,
      ),
    );
    const copiedUneditedPages = new Map();
    const uneditedPageNums = [];

    for (let i = 1; i <= totalPages; i++) {
      if (!editedPages.has(i)) uneditedPageNums.push(i);
    }

    if (uneditedPageNums.length) {
      const copiedPages = await out.copyPages(
        originalDoc,
        uneditedPageNums.map((pageNum) => pageNum - 1),
      );
      copiedPages.forEach((page, index) => {
        copiedUneditedPages.set(uneditedPageNums[index], page);
      });
    }

    for (let i = 1; i <= totalPages; i++) {
      if (!editedPages.has(i)) {
        const copiedPage = copiedUneditedPages.get(i);
        if (copiedPage) out.addPage(copiedPage);
        continue;
      }

      const page = await src.getPage(i);
      const viewport = page.getViewport({ scale: renderScale });
      const baseViewport = page.getViewport({ scale: 1 });
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { alpha: false });

      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;

      const layer = editLayers?.[i] || { texts: [], annotations: [] };
      const coordScale = renderScale / BASE_SCALE;
      const fallbackBg = pageBgs?.[i] || "rgb(255,255,255)";

      for (const block of layer.texts || []) {
        if (block.isEdited)
          drawVisualCover(ctx, canvas, block, coordScale, fallbackBg);
      }
      for (const block of layer.texts || []) {
        drawVisualText(ctx, block, coordScale);
      }
      drawVisualAnnotations(ctx, layer.annotations, coordScale);

      const pngBytes = await canvasToPngBytes(canvas);
      const png = await out.embedPng(pngBytes);
      const outPage = out.addPage([baseViewport.width, baseViewport.height]);
      outPage.drawImage(png, {
        x: 0,
        y: 0,
        width: baseViewport.width,
        height: baseViewport.height,
      });

      canvas.width = 1;
      canvas.height = 1;
    }

    return await out.save({ useObjectStreams: true, addDefaultPage: false });
  } finally {
    await srcTask.destroy();
  }
}

// ─── Main export ──────────────────────────────────────────────────────────
async function exportVectorPdf(
  originalArrayBuffer,
  editLayers,
  pageCount,
  pageBgs,
  blockBgs,
) {
  const pdfDoc = await PDFDocument.load(originalArrayBuffer, {
    ignoreEncryption: true,
  });
  pdfDoc.registerFontkit(fontkit);
  const pages = pdfDoc.getPages();
  const fontCache = {};

  async function getFont(block, pageNum, previewText = "") {
    const embedded = getEmbeddedFontData(
      pageNum,
      block.fontResource,
      block.fontName,
    );
    if (embedded?.bytes?.byteLength) {
      const embeddedKey = [
        "embedded",
        pageNum,
        block.fontResource?.internalName || "",
        embedded.name || block.fontName || "font",
        embedded.bytes.byteLength,
      ].join(":");
      try {
        if (!fontCache[embeddedKey]) {
          fontCache[embeddedKey] = await pdfDoc.embedFont(embedded.bytes, {
            subset: true,
          });
        }

        // Verify this edited string can actually be encoded by the font. Many
        // PDFs carry subset fonts that only contain the original glyphs.
        if (previewText) {
          if (!fontSupportsText(fontCache[embeddedKey], previewText)) {
            throw new Error(
              "Embedded font subset cannot render replacement text",
            );
          }
          fontCache[embeddedKey].widthOfTextAtSize(
            previewText,
            Math.max((block.fontSize || 12) / BASE_SCALE, 1),
          );
          fontCache[embeddedKey].encodeText(previewText);
        }
        return fontCache[embeddedKey];
      } catch (_) {
        delete fontCache[embeddedKey];
      }
    }

    const key = pickStdFont(block);
    if (!fontCache[key]) fontCache[key] = await pdfDoc.embedFont(key);
    return fontCache[key];
  }

  for (let i = 0; i < pageCount; i++) {
    const layer = editLayers[i + 1];
    if (!layer) continue;
    const page = pages[i];
    if (!page) continue;
    const { width: pageW, height: pageH } = page.getSize();

    // Page background colour for whiteout rect
    const bgRgb = pageBgs?.[i + 1]
      ? parseRgbString(pageBgs[i + 1].replace("rgb(", "").replace(")", ""))
      : rgb(1, 1, 1);

    // 1. Whiteout all edited original positions
    // Prefer each block's own locally-sampled color (matters on watermarks,
    // seals, or any non-flat region) over the single flat page-wide color.
    for (const block of layer.texts || []) {
      if (!block.isEdited) continue;
      const localBgStr = blockBgs?.[i + 1]?.[block.id];
      const blockRgb = localBgStr
        ? parseRgbString(localBgStr.replace("rgb(", "").replace(")", ""))
        : bgRgb;
      whiteoutBlock(page, block, pageH, blockRgb);
    }

    // 2. Draw replacement + new text
    for (const block of layer.texts || []) {
      if (!block.str?.trim()) continue;
      const safe = sanitize(block.str);
      if (!safe) continue;

      const font = await getFont(block, i + 1, safe);
      const color = hexToRgb(block.color || "#000000");
      const { x, y, size } = canvasToPdf(
        block.x,
        block.y,
        block.fontSize,
        pageH,
        block.baselineOffset,
      );
      const drawOptions = { x, y, size, font, color };

      // Skip items that landed off-page (clip with small margin)
      if (x < -20 || x > pageW + 20 || y < -20 || y > pageH + 20) continue;

      try {
        drawFittedText(page, safe, drawOptions, block);
      } catch {
        // Last resort: plain Helvetica
        try {
          const hf =
            fontCache[StandardFonts.Helvetica] ||
            (fontCache[StandardFonts.Helvetica] = await pdfDoc.embedFont(
              StandardFonts.Helvetica,
            ));
          const fallbackOptions = { ...drawOptions, font: hf };
          drawFittedText(page, safe, fallbackOptions, block);
        } catch (_) {
          /* skip truly un-renderable blocks */
        }
      }
    }

    // 3. Annotations (highlight / redact / shape)
    for (const ann of layer.annotations || []) {
      const ax = ann.x / BASE_SCALE;
      const aw = ann.width / BASE_SCALE;
      const ah = ann.height / BASE_SCALE;
      const ay = pageH - ann.y / BASE_SCALE - ah;

      if (ann.type === "highlight") {
        page.drawRectangle({
          x: ax,
          y: ay,
          width: aw,
          height: ah,
          color: rgb(1, 0.92, 0.15),
          opacity: 0.4,
        });
      } else if (ann.type === "redact") {
        page.drawRectangle({
          x: ax,
          y: ay,
          width: aw,
          height: ah,
          color: rgb(0, 0, 0),
        });
      } else if (ann.type === "rect") {
        page.drawRectangle({
          x: ax,
          y: ay,
          width: aw,
          height: ah,
          borderColor: hexToRgb(ann.color || "#e84545"),
          borderWidth: 1.5,
          opacity: 0,
        });
      }
    }
  }

  return await pdfDoc.save();
}

export async function exportPdf(
  originalArrayBuffer,
  editLayers,
  pageCount,
  pageBgs,
  blockBgs,
) {
  try {
    return await exportVisualPdf(
      originalArrayBuffer,
      editLayers,
      pageCount,
      pageBgs,
    );
  } catch (err) {
    console.warn(
      "Visual PDF export failed; falling back to vector export.",
      err,
    );
    return await exportVectorPdf(
      originalArrayBuffer,
      editLayers,
      pageCount,
      pageBgs,
      blockBgs,
    );
  }
}

// ─── Standalone tool functions ─────────────────────────────────────────────
export async function mergePdfs(arrayBuffers) {
  const merged = await PDFDocument.create();
  for (const buf of arrayBuffers) {
    const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
  }
  return await merged.save();
}

export async function splitPdf(arrayBuffer, ranges) {
  const src = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const total = src.getPageCount();
  const out = [];
  for (const range of ranges) {
    const doc = await PDFDocument.create();
    const indices = [];
    for (let i = range.from - 1; i < range.to && i < total; i++)
      indices.push(i);
    if (!indices.length) continue;
    (await doc.copyPages(src, indices)).forEach((p) => doc.addPage(p));
    out.push(await doc.save());
  }
  return out;
}

export async function extractPages(arrayBuffer, pageNums) {
  const src = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const doc = await PDFDocument.create();
  const total = src.getPageCount();
  const indices = [...new Set(pageNums.map((n) => n - 1))]
    .filter((i) => i >= 0 && i < total)
    .sort((a, b) => a - b);
  (await doc.copyPages(src, indices)).forEach((p) => doc.addPage(p));
  return await doc.save();
}

export async function rotatePdf(arrayBuffer, pageNum, angle) {
  const doc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const page = doc.getPages()[pageNum - 1];
  if (page) page.setRotation(degrees((page.getRotation().angle + angle) % 360));
  return await doc.save();
}

export async function rotateAllPages(arrayBuffer, angle) {
  const doc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  doc
    .getPages()
    .forEach((p) =>
      p.setRotation(degrees((p.getRotation().angle + angle) % 360)),
    );
  return await doc.save();
}

export async function removePageFromPdf(arrayBuffer, pageNum) {
  const doc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  if (doc.getPageCount() <= 1) throw new Error("Cannot remove the only page");
  doc.removePage(pageNum - 1);
  return await doc.save();
}

export async function addPageToPdf(arrayBuffer, position) {
  const doc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  doc.insertPage(position, [595.28, 841.89]);
  return await doc.save();
}

export async function reorderPages(arrayBuffer, newOrder) {
  const src = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const doc = await PDFDocument.create();
  (
    await doc.copyPages(
      src,
      newOrder.map((n) => n - 1),
    )
  ).forEach((p) => doc.addPage(p));
  return await doc.save();
}

export async function compressPdf(arrayBuffer) {
  const doc = await PDFDocument.load(arrayBuffer, {
    ignoreEncryption: true,
    updateMetadata: false,
  });
  return await doc.save({ useObjectStreams: true, addDefaultPage: false });
}

function canvasToJpegBytes(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          reject(new Error("Could not encode page image"));
          return;
        }
        resolve(await blob.arrayBuffer());
      },
      "image/jpeg",
      quality,
    );
  });
}

function compressionAttempts(preset = "balanced", targetRatio = 0.5) {
  const base =
    {
      high: [
        { scale: 1.6, quality: 0.9 },
        { scale: 1.35, quality: 0.82 },
        { scale: 1.15, quality: 0.74 },
        { scale: 1.0, quality: 0.66 },
        { scale: 0.85, quality: 0.58 },
        { scale: 0.72, quality: 0.5 },
      ],
      balanced: [
        { scale: 1.25, quality: 0.82 },
        { scale: 1.05, quality: 0.74 },
        { scale: 0.9, quality: 0.66 },
        { scale: 0.76, quality: 0.58 },
        { scale: 0.64, quality: 0.5 },
        { scale: 0.54, quality: 0.42 },
        { scale: 0.45, quality: 0.34 },
      ],
      small: [
        { scale: 0.95, quality: 0.7 },
        { scale: 0.78, quality: 0.58 },
        { scale: 0.64, quality: 0.48 },
        { scale: 0.52, quality: 0.38 },
        { scale: 0.42, quality: 0.3 },
        { scale: 0.34, quality: 0.24 },
        { scale: 0.28, quality: 0.2 },
      ],
    }[preset] || [];

  if (targetRatio < 0.18) return base.slice(Math.max(0, base.length - 5));
  if (targetRatio < 0.35) return base.slice(Math.max(0, base.length - 6));
  return base;
}

async function rasterCompressAttempt(
  arrayBuffer,
  scale,
  quality,
  onProgress,
  attemptIndex,
  attemptCount,
) {
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer.slice(0) });
  const src = await loadingTask.promise;
  const out = await PDFDocument.create();

  try {
    for (let i = 1; i <= src.numPages; i++) {
      const page = await src.getPage(i);
      const baseViewport = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { alpha: false });
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;

      const jpgBytes = await canvasToJpegBytes(canvas, quality);
      const jpg = await out.embedJpg(jpgBytes);
      const outPage = out.addPage([baseViewport.width, baseViewport.height]);
      outPage.drawImage(jpg, {
        x: 0,
        y: 0,
        width: baseViewport.width,
        height: baseViewport.height,
      });

      canvas.width = 1;
      canvas.height = 1;
      onProgress?.({
        attempt: attemptIndex + 1,
        attempts: attemptCount,
        page: i,
        pages: src.numPages,
        scale,
        quality,
      });
    }

    return await out.save({ useObjectStreams: true, addDefaultPage: false });
  } finally {
    await loadingTask.destroy();
  }
}

export async function compressPdfToTarget(arrayBuffer, options = {}) {
  const { targetBytes, preset = "balanced", onProgress } = options;

  const originalBytes = arrayBuffer.byteLength;
  if (!targetBytes || targetBytes <= 0) {
    const bytes = await compressPdf(arrayBuffer);
    return {
      bytes,
      mode: "lossless",
      reachedTarget: !targetBytes || bytes.byteLength <= targetBytes,
    };
  }

  const lossless = await compressPdf(arrayBuffer);
  if (lossless.byteLength <= targetBytes) {
    return { bytes: lossless, mode: "lossless", reachedTarget: true };
  }

  const attempts = compressionAttempts(preset, targetBytes / originalBytes);
  let best = lossless;
  let bestMeta = { mode: "lossless", scale: 1, quality: 1 };

  for (let i = 0; i < attempts.length; i++) {
    const { scale, quality } = attempts[i];
    const bytes = await rasterCompressAttempt(
      arrayBuffer,
      scale,
      quality,
      onProgress,
      i,
      attempts.length,
    );
    if (bytes.byteLength < best.byteLength) {
      best = bytes;
      bestMeta = { mode: "visual", scale, quality };
    }
    if (bytes.byteLength <= targetBytes) {
      return { bytes, ...bestMeta, reachedTarget: true };
    }
  }

  return {
    bytes: best,
    ...bestMeta,
    reachedTarget: best.byteLength <= targetBytes,
  };
}

export async function protectPdf(arrayBuffer, password, options = {}) {
  if (!password) throw new Error("Password is required");
  const encrypted = await encryptPDF(new Uint8Array(arrayBuffer), password, {
    ownerPassword: options.ownerPassword || password,
    algorithm: options.algorithm || "AES-256",
    allowPrinting: options.allowPrinting ?? true,
    allowModifying: options.allowModifying ?? false,
    allowCopying: options.allowCopying ?? false,
    allowAnnotating: options.allowAnnotating ?? false,
    allowFillingForms: options.allowFillingForms ?? true,
    allowExtraction: options.allowExtraction ?? true,
    allowAssembly: options.allowAssembly ?? false,
    allowHighQualityPrint: options.allowHighQualityPrint ?? true,
  });
  return encrypted instanceof Uint8Array
    ? encrypted
    : new Uint8Array(encrypted);
}

export async function addWatermark(input, textOrOptions, maybeOptions = {}) {
  const arrayBuffer = await normalizeInputToArrayBuffer(input);
  const options = normalizeWatermarkOptions(textOrOptions, maybeOptions);
  const doc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const pages = doc.getPages();
  const targetPages = resolveTargetPages(pages.length, options.targetPages);
  const color = hexToRgb(options.color || "#737373");
  const rotation = Number(options.rotation) || 0;
  const opacity = Math.max(0.01, Math.min(Number(options.opacity) || 0.13, 1));
  const fontCache = {};

  async function getWatermarkFont() {
    const fontName = pickWatermarkFontName(
      options.fontFamily,
      options.bold,
      options.italic,
    );
    if (!fontCache[fontName])
      fontCache[fontName] = await doc.embedFont(fontName);
    return fontCache[fontName];
  }

  let embeddedImage = null;
  if (options.type === "image") {
    if (!options.imageBytes)
      throw new Error("Choose a PNG or JPG watermark image");
    const imageBytes =
      options.imageBytes instanceof Uint8Array
        ? options.imageBytes
        : new Uint8Array(options.imageBytes);
    embeddedImage =
      options.imageType === "image/png"
        ? await doc.embedPng(imageBytes)
        : await doc.embedJpg(imageBytes);
  }

  const safeText = sanitize(options.text || "CONFIDENTIAL") || "CONFIDENTIAL";

  for (const pageNumber of targetPages) {
    const page = pages[pageNumber - 1];
    if (!page) continue;

    const { width: pageWidth, height: pageHeight } = page.getSize();

    if (options.type === "image") {
      const markWidth = pageWidth * ((Number(options.imageScale) || 28) / 100);
      const markHeight =
        markWidth * (embeddedImage.height / embeddedImage.width);
      const placements = buildWatermarkPlacements(
        pageWidth,
        pageHeight,
        markWidth,
        markHeight,
        options,
      );
      for (const placement of placements) {
        page.drawImage(embeddedImage, {
          x: placement.x,
          y: pageHeight - placement.y - markHeight,
          width: markWidth,
          height: markHeight,
          opacity,
          rotate: degrees(rotation),
        });
      }
      continue;
    }

    const font = await getWatermarkFont();
    const fontSize = Math.max(Number(options.fontSize) || 52, 8);
    const markWidth = font.widthOfTextAtSize(safeText, fontSize);
    const markHeight = fontSize * 1.05;
    const placements = buildWatermarkPlacements(
      pageWidth,
      pageHeight,
      markWidth,
      markHeight,
      options,
    );

    for (const placement of placements) {
      page.drawText(safeText, {
        x: placement.x,
        y: pageHeight - placement.y - fontSize * 0.85,
        size: fontSize,
        font,
        color,
        opacity,
        rotate: degrees(rotation),
      });
    }
  }

  return await doc.save();
}

export function downloadBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
