import React, { useState, useEffect, useMemo } from "react";
import {
  MousePointer2,
  Type,
  Image,
  Pencil,
  Square,
  PenLine,
  Highlighter,
  EyeOff,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Download,
  Scan,
  Sparkles,
  Loader2,
  Bold,
  Italic,
  Underline,
  PanelLeft,
  SlidersHorizontal,
  Languages,
} from "lucide-react";
import toast from "react-hot-toast";
import { usePdfStore } from "../../store/pdfStore.js";
import { exportPdf, downloadBytes } from "../../lib/pdfExporter.js";
import { ocrPage, OcrUnavailableError } from "../../lib/ocrPipeline.js";
import OcrModal from "./OcrModal.jsx";
import {
  translatePage,
  sortByReadingOrder,
  expandTranslations,
} from "../../lib/translation.js";
import {
  buildPageEntries,
  createMeasureWidth,
  fitTranslations,
  expansionItems,
  mergeExpansions,
} from "../../lib/translationFit.js";
import DropZone from "../ui/DropZone.jsx";
import styles from "./EditorToolbar.module.css";

const TOOLS = [
  { id: "select", icon: MousePointer2, label: "Select & edit text" },
  { id: "text", icon: Type, label: "Add text box" },
  { id: "image", icon: Image, label: "Add image" },
  { id: "draw", icon: Pencil, label: "Draw" },
  { id: "shape", icon: Square, label: "Shape" },
  { id: "sign", icon: PenLine, label: "Sign" },
  { id: "highlight", icon: Highlighter, label: "Highlight" },
  { id: "redact", icon: EyeOff, label: "Redact" },
];

// Font families come from fontRegistry.js — the single list shared with the
// properties panel, classifyFont, and the vector exporter (custom families
// embed real TTFs; labels preview in their own typeface).
import { FAMILIES as FONTS, canonicalFamily } from "../../lib/fontRegistry.js";

export default function EditorToolbar() {
  const {
    activeTool,
    setActiveTool,
    zoom,
    setZoom,
    file,
    editLayers,
    pageCount,
    fileName,
    pageBgs,
    blockBgs,
    currentPage,
    addOcrResult,
    ocrActive,
    setOcrActive,
    selectedElement,
    selectedElementPage,
    updateBlock,
    setFont,
    undoEdit,
    redoEdit,
    getLayer,
    extractedItems,
    applyPageTranslations,
    mobilePagesOpen,
    mobilePropertiesOpen,
    setMobilePagesOpen,
    setMobilePropertiesOpen,
  } = usePdfStore();

  const [ocrRunning, setOcrRunning] = useState(false);
  const [translatingPage, setTranslatingPage] = useState(false);

  // Offscreen-canvas measurer from lib/translationFit.js — one shared 2d
  // context, block-font aware.
  const measureWidth = useMemo(() => createMeasureWidth(), []);

  // ── Translate the whole current page in one contextual GLM request ──
  // Assembly + box-fitting live in lib/translationFit.js (buildPageEntries
  // merges extracted originals, their committed edits and user boxes with
  // per-block budgets; fitTranslations condenses anything that MEASURES past
  // its box). Here we only orchestrate: request, fit, apply, report.
  const handleTranslatePage = async () => {
    if (translatingPage || !file) return;
    const layer = getLayer(currentPage);
    const entries = buildPageEntries({
      extractedItems: extractedItems[currentPage] || [],
      layerTexts: layer.texts || [],
      pageBg: pageBgs[currentPage] || "white",
    });

    const ordered = sortByReadingOrder(entries);
    if (!ordered.length) {
      toast("Nothing to translate on this page", { icon: "🚫" });
      return;
    }

    setTranslatingPage(true);
    try {
      const result = await translatePage(
        ordered.map(({ id, text, budget }) => ({ id, text, budget })),
      );
      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      result.translations = await fitTranslations(
        ordered,
        result.translations,
        {
          measureWidth,
        },
      );

      // Right-margin fill, text-only: rephrase lines that land short so they
      // fill ~95% of their box NATURALLY — same font, same size, no spacing
      // tricks. Candidates are validated (fit + real gain) before merging.
      const expandables = expansionItems(ordered, result.translations, {
        measureWidth,
      });
      if (expandables.length) {
        const expanded = await expandTranslations(expandables);
        if (expanded.ok) {
          result.translations = mergeExpansions(
            ordered,
            result.translations,
            expanded.translations,
            { measureWidth },
          );
        }
      }

      // Final safety pass with honest boxes (boxOf clamps to the original
      // line's measured footprint): if ANY line — translated or expanded —
      // now sits past its own original width, condense it back inside.
      // Nothing may exit the margin the original didn't already cross.
      result.translations = await fitTranslations(
        ordered,
        result.translations,
        {
          measureWidth,
        },
      );

      const updates = ordered
        .map((e) => ({
          block: e.block,
          newStr: result.translations[e.id],
          isExtracted: e.kind === "extracted",
        }))
        .filter((u) => u.newStr && u.newStr.trim());
      if (!updates.length) {
        toast.error("Translation service returned no text for this page.");
        return;
      }
      applyPageTranslations(currentPage, updates);
      const skipped = result.failed.length;
      toast.success(
        `${updates.length} block${updates.length === 1 ? "" : "s"} translated — Ctrl+Z to undo${skipped ? ` (${skipped} skipped)` : ""}`,
        { duration: 4000 },
      );
    } finally {
      setTranslatingPage(false);
    }
  };

  // Mirror selected element's current formatting in the toolbar
  const sel = selectedElement;
  const [fontFamily, setFontFamily] = useState("Helvetica");
  const [fontSize, setFontSize] = useState(12);
  // Draft keeps intermediate typing ("", "1") editable without the 4-200
  // clamp fighting each keystroke; commits on valid change, Enter, or blur.
  const [sizeDraft, setSizeDraft] = useState(null);
  const [bold, setBold] = useState(false);
  const [italic, setItalic] = useState(false);
  const [underline, setUnderline] = useState(false);
  const [color, setColor] = useState("#000000");

  // Sync toolbar state when selection changes
  useEffect(() => {
    if (!sel) return;
    // Canonical picker value through the registry — the dropdown mirrors what
    // export will honor, never a guess from the CSS stack.
    setFontFamily(canonicalFamily(sel));
    setFontSize(Math.round(sel.fontSize || 12));
    setBold(sel.fontBold || false);
    setItalic(sel.fontItalic || false);
    setUnderline(sel.fontUnderline || false);
    setColor(sel.color || "#000000");
    setSizeDraft(null);
  }, [
    sel?.id,
    sel?.fontFamily,
    sel?.fontName,
    sel?.fontBold,
    sel?.fontItalic,
    sel?.fontUnderline,
    sel?.fontSize,
    sel?.color,
  ]);

  // Apply a formatting update to the selected element (commit-then-update
  // for uncommitted extracted blocks is owned by the store action)
  const applyFormat = (updates) => {
    if (!sel || !selectedElementPage) return;
    updateBlock(selectedElementPage, sel, updates);
  };

  const handleFontFamily = (value) => {
    setFontFamily(value);
    setFont(selectedElementPage, sel, value);
  };

  const handleFontSize = (v) => {
    const n = Math.max(4, Math.min(200, Number(v)));
    setFontSize(n);
    applyFormat({ fontSize: n });
  };

  const handleBold = () => {
    const next = !bold;
    setBold(next);
    applyFormat({ fontBold: next });
  };

  const handleItalic = () => {
    const next = !italic;
    setItalic(next);
    applyFormat({ fontItalic: next });
  };

  const handleUnderline = () => {
    const next = !underline;
    setUnderline(next);
    applyFormat({ fontUnderline: next });
  };

  const handleColor = (v) => {
    setColor(v);
    applyFormat({ color: v });
  };

  const handleUndo = () => {
    if (!undoEdit()) {
      toast("Nothing to undo");
      return;
    }
    toast("Undone", { duration: 800 });
  };

  const handleRedo = () => {
    if (!redoEdit()) {
      toast("Nothing to redo");
      return;
    }
    toast("Redone", { duration: 800 });
  };

  const handleExport = async () => {
    if (!file) {
      toast.error("No PDF loaded");
      return;
    }
    const tid = toast.loading("Exporting PDF...");
    try {
      const bytes = await exportPdf(
        file,
        editLayers,
        pageCount,
        pageBgs,
        blockBgs,
      );
      downloadBytes(bytes, `pdfzero-${fileName || "edited.pdf"}`);
      toast.success("PDF downloaded!", { id: tid });
    } catch (e) {
      toast.error("Export failed: " + e.message, { id: tid });
    }
  };

  const handleOcr = async () => {
    if (!file || ocrRunning) return;
    setOcrRunning(true);
    const tid = toast.loading(`Running OCR on page ${currentPage}...`);
    try {
      const result = await ocrPage(currentPage, {
        onStage: (stage, detail) => {
          const labels = {
            render: `Running OCR on page ${currentPage}...`,
            detect: "Detecting OCR engine...",
            ollama: `OCR via Ollama (${detail})...`,
            format: "Formatting with GLM...",
          };
          if (labels[stage]) toast.loading(labels[stage], { id: tid });
        },
      });
      if (!result.raw.trim()) {
        toast.error("No text found", { id: tid });
        return;
      }
      toast.success("OCR complete — review the result", { id: tid });
      addOcrResult({ ...result, page: currentPage });
    } catch (e) {
      toast.error(
        e instanceof OcrUnavailableError
          ? e.message
          : "OCR failed: " + e.message,
        { id: tid },
      );
    } finally {
      setOcrRunning(false);
    }
  };

  const hasSelection = !!sel;

  return (
    <div className={styles.toolbar}>
      {/* Mobile-only: toggle the Pages drawer (hidden on desktop, panel is always visible there) */}
      <button
        className={`${styles.toolBtn} ${styles.mobileOnly} ${mobilePagesOpen ? styles.active : ""}`}
        onClick={() => setMobilePagesOpen(!mobilePagesOpen)}
        title="Pages"
        aria-label="Toggle pages panel"
      >
        <PanelLeft size={16} />
      </button>

      <DropZone compact />
      <div className={styles.sep} />

      {/* Drawing tools */}
      <div className={styles.toolGroup}>
        {TOOLS.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            className={`${styles.toolBtn} ${activeTool === id ? styles.active : ""}`}
            onClick={() => setActiveTool(id)}
            title={label}
            aria-label={label}
          >
            <Icon size={15} />
          </button>
        ))}
      </div>

      <div className={`${styles.sep} ${styles.desktopOnly}`} />

      {/* Font family — hidden on mobile; use the Properties drawer instead (less crowding) */}
      <select
        className={`${styles.select} ${styles.desktopOnly}`}
        value={fontFamily}
        onChange={(e) => handleFontFamily(e.target.value)}
        disabled={!hasSelection}
        title="Font family"
        aria-label="Font family"
      >
        {FONTS.map((f) => (
          <option key={f.value} value={f.value} style={{ fontFamily: f.css }}>
            {f.label}
          </option>
        ))}
      </select>

      {/* Font size — native spinners hidden (they collide at 40px); the
          number is still keyboard-arrow steppable and clamped 4-200 */}
      <input
        type="number"
        className={`${styles.numInput} ${styles.desktopOnly}`}
        value={sizeDraft ?? fontSize}
        min={4}
        max={200}
        step={1}
        disabled={!hasSelection}
        onChange={(e) => {
          setSizeDraft(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value !== "" && Number.isFinite(n) && n >= 4)
            handleFontSize(n);
        }}
        onBlur={() => setSizeDraft(null)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const n = Number(e.currentTarget.value);
            handleFontSize(Number.isFinite(n) ? n : 12);
            setSizeDraft(null);
            e.currentTarget.blur();
          }
        }}
        title="Font size"
        aria-label="Font size"
      />

      {/* Bold */}
      <button
        className={`${styles.fmtBtn} ${styles.desktopOnly} ${bold ? styles.fmtActive : ""}`}
        onClick={handleBold}
        disabled={!hasSelection}
        title="Bold (affects export)"
        aria-label="Bold"
        aria-pressed={bold}
      >
        <Bold size={14} />
      </button>

      {/* Italic */}
      <button
        className={`${styles.fmtBtn} ${styles.desktopOnly} ${italic ? styles.fmtActive : ""}`}
        onClick={handleItalic}
        disabled={!hasSelection}
        title="Italic (affects export)"
        aria-label="Italic"
        aria-pressed={italic}
      >
        <Italic size={14} />
      </button>

      {/* Underline — CSS only, marks in store */}
      <button
        className={`${styles.fmtBtn} ${styles.desktopOnly} ${underline ? styles.fmtActive : ""}`}
        onClick={handleUnderline}
        disabled={!hasSelection}
        title="Underline"
        aria-label="Underline"
        aria-pressed={underline}
      >
        <Underline size={14} />
      </button>

      <div className={`${styles.sep} ${styles.desktopOnly}`} />

      {/* Color */}
      <input
        type="color"
        className={`${styles.colorPicker} ${styles.desktopOnly}`}
        value={color}
        disabled={!hasSelection}
        onChange={(e) => handleColor(e.target.value)}
        title="Text color"
        aria-label="Text color"
      />

      <div className={styles.sep} />

      {/* Undo / Redo */}
      <button
        className={styles.toolBtn}
        onClick={handleUndo}
        title="Undo (Ctrl+Z)"
        aria-label="Undo"
      >
        <Undo2 size={15} />
      </button>
      <button
        className={styles.toolBtn}
        onClick={handleRedo}
        title="Redo (Ctrl+Y)"
        aria-label="Redo"
      >
        <Redo2 size={15} />
      </button>

      <div className={styles.sep} />

      {/* Zoom */}
      <button
        className={styles.toolBtn}
        onClick={() => setZoom(zoom - 0.2)}
        title="Zoom out"
      >
        <ZoomOut size={15} />
      </button>
      <span className={styles.zoomLabel}>{Math.round(zoom * 100)}%</span>
      <button
        className={styles.toolBtn}
        onClick={() => setZoom(zoom + 0.2)}
        title="Zoom in"
      >
        <ZoomIn size={15} />
      </button>

      <div className={styles.spacer} />

      <button
        className={`${styles.aiBtn} ${ocrRunning ? styles.aiBtnActive : ""}`}
        onClick={handleOcr}
        disabled={ocrRunning || !file}
      >
        {ocrRunning ? (
          <>
            <Loader2 size={13} className={styles.spin} /> OCR…
          </>
        ) : (
          <>
            <Scan size={13} /> OCR
          </>
        )}
      </button>

      <button
        className={`${styles.aiBtn} ${translatingPage ? styles.aiBtnActive : ""}`}
        onClick={handleTranslatePage}
        disabled={translatingPage || !file}
        title="Translate every text block on this page (EN↔ES)"
      >
        {translatingPage ? (
          <>
            <Loader2 size={13} className={styles.spin} /> Translating page…
          </>
        ) : (
          <>
            <Languages size={13} /> Translate
          </>
        )}
      </button>

      <button
        className={styles.aiBtn}
        onClick={() => toast("AI font match — v1.1", { icon: "✨" })}
      >
        <Sparkles size={13} /> AI fix
      </button>

      <div className={styles.sep} />

      <div className={styles.sep} />

      {/* Mobile-only: toggle the Properties drawer */}
      <button
        className={`${styles.toolBtn} ${styles.mobileOnly} ${mobilePropertiesOpen ? styles.active : ""}`}
        onClick={() => setMobilePropertiesOpen(!mobilePropertiesOpen)}
        title="Properties"
        aria-label="Toggle properties panel"
      >
        <SlidersHorizontal size={16} />
      </button>

      <button
        className={styles.exportBtn}
        onClick={handleExport}
        disabled={!file}
      >
        <Download size={14} /> Download PDF
      </button>

      <OcrModal result={ocrActive} onClose={() => setOcrActive(null)} />
    </div>
  );
}
