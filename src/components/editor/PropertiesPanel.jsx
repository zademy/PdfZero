import React from "react";
import { Minus, Plus } from "lucide-react";
import {
  FileText,
  Layers,
  Info,
  Lock,
  Droplets,
  EyeOff,
  Palette,
} from "lucide-react";
import toast from "react-hot-toast";
import { usePdfStore } from "../../store/pdfStore.js";
import { addWatermark, downloadBytes } from "../../lib/pdfExporter.js";
import { classifyFont } from "../../lib/pdfRenderer.js";
import { FAMILIES as FONT_FAMILIES } from "../../lib/fontRegistry.js";
import styles from "./PropertiesPanel.module.css";

const MIN_FONT_SIZE = 4;
const MAX_FONT_SIZE = 200;

const clampFontSize = (n) =>
  Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(n)));

export default function PropertiesPanel() {
  const {
    selectedElement,
    selectedElementPage,
    file,
    fileName,
    pageCount,
    editLayers,
    updateTextBlock,
    commitExtractedEdit,
  } = usePdfStore();

  // Local draft for the size stepper: keeps intermediate typing ("", "1")
  // editable without the clamp fighting the user; commits on valid change,
  // Enter, or blur. Re-syncs whenever the selection or its size changes.
  const [sizeDraft, setSizeDraft] = React.useState(null);
  const selectedSize = selectedElement?.fontSize;
  React.useEffect(() => {
    setSizeDraft(null);
  }, [selectedElement?.id, selectedElementPage, selectedSize]);

  const totalEdits = Object.values(editLayers).reduce(
    (sum, layer) =>
      sum + (layer.texts?.length || 0) + (layer.annotations?.length || 0),
    0,
  );

  // Update a property on the selected element (works for both store & extracted)
  const updateProp = (updates) => {
    if (!selectedElement || !selectedElementPage) return;
    const targetId =
      selectedElement.isExtracted && !selectedElement.isEdited
        ? `edited-${selectedElement.id}`
        : selectedElement.id;
    // For extracted blocks that haven't been committed yet, commitExtractedEdit
    // For store blocks (user-added or already-committed), updateTextBlock
    if (selectedElement.isExtracted && !selectedElement.isEdited) {
      commitExtractedEdit(
        selectedElementPage,
        selectedElement,
        selectedElement.str,
      );
    }
    updateTextBlock(selectedElementPage, targetId, updates);
    // Also update selectedElement in store so UI reflects immediately
  };

  const handleWatermark = async () => {
    if (!file) return;
    const text = window.prompt("Watermark text:", "CONFIDENTIAL");
    if (!text) return;
    const tid = toast.loading("Adding watermark...");
    try {
      const bytes = await addWatermark(file, text);
      downloadBytes(bytes, `watermarked-${fileName}`);
      toast.success("Downloaded!", { id: tid });
    } catch {
      toast.error("Failed", { id: tid });
    }
  };

  // Clean font name for display
  const displayFont = (name) => {
    if (!name) return "Unknown";
    return name
      .replace(/^[A-Z]{6}\+/, "")
      .replace(/-(Bold|Italic|Oblique|Regular)/gi, "")
      .replace(/^g_[a-z0-9]+_/i, "")
      .slice(0, 22);
  };

  return (
    <div className={styles.panel}>
      {/* Document info */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>
          <Info size={12} /> Document
        </div>
        <div className={styles.row}>
          <span className={styles.lbl}>Pages</span>
          <span className={styles.val}>{pageCount || "—"}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.lbl}>Edits</span>
          <span className={styles.val}>{totalEdits}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.lbl}>File</span>
          <span
            className={styles.val}
            style={{
              fontSize: 10,
              maxWidth: 90,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {fileName || "—"}
          </span>
        </div>
      </div>

      {/* Selection properties — only when something is selected */}
      {selectedElement ? (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <Layers size={12} /> Selection
          </div>

          {/* Detected font badge */}
          <div className={styles.detectedFont}>
            <Palette size={11} />
            {displayFont(selectedElement.fontName)}
            {selectedElement.isExtracted && !selectedElement.isEdited && (
              <span className={styles.extractedBadge}>PDF original</span>
            )}
          </div>

          {/* Text preview */}
          <div className={styles.textPreview}>
            {selectedElement.str?.slice(0, 60) || "(empty)"}
            {(selectedElement.str?.length || 0) > 60 ? "…" : ""}
          </div>

          {/* Font family — controlled; classifyFont canonicalizes whatever the
              block carries (embedded PDF name or previous web-name choice) to
              one of the three export families so the picker always matches. */}
          <div className={styles.row}>
            <span className={styles.lbl}>Font</span>
            <select
              className={styles.fontCtrl}
              value={classifyFont(selectedElement.fontName || "").family}
              onChange={(e) => updateProp({ fontName: e.target.value })}
            >
              {FONT_FAMILIES.map((f) => (
                <option
                  key={f.value}
                  value={f.value}
                  style={{ fontFamily: f.css }}
                >
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          {/* Font size — stepper with hidden native spinners; clamped both
              ways (the old max attr only bounded the spinner, not typing). */}
          <div className={styles.row}>
            <span className={styles.lbl}>Size</span>
            <div className={styles.stepper}>
              <button
                type="button"
                className={styles.stepBtn}
                aria-label="Decrease font size"
                onClick={() =>
                  updateProp({
                    fontSize: clampFontSize((selectedSize || 12) - 1),
                  })
                }
              >
                <Minus size={11} />
              </button>
              <input
                type="number"
                min={MIN_FONT_SIZE}
                max={MAX_FONT_SIZE}
                step={1}
                className={styles.sizeField}
                value={sizeDraft ?? clampFontSize(selectedSize || 12)}
                onChange={(e) => {
                  setSizeDraft(e.target.value);
                  const n = Number(e.target.value);
                  if (
                    e.target.value !== "" &&
                    Number.isFinite(n) &&
                    n >= MIN_FONT_SIZE
                  )
                    updateProp({ fontSize: clampFontSize(n) });
                }}
                onBlur={() => setSizeDraft(null)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const n = Number(e.currentTarget.value);
                    updateProp({
                      fontSize: clampFontSize(Number.isFinite(n) ? n : 12),
                    });
                    setSizeDraft(null);
                    e.currentTarget.blur();
                  }
                }}
              />
              <button
                type="button"
                className={styles.stepBtn}
                aria-label="Increase font size"
                onClick={() =>
                  updateProp({
                    fontSize: clampFontSize((selectedSize || 12) + 1),
                  })
                }
              >
                <Plus size={11} />
              </button>
            </div>
          </div>

          {/* Color — shows the DETECTED color from PDF */}
          <div className={styles.row}>
            <span className={styles.lbl}>Color</span>
            <div className={styles.colorRow}>
              <input
                type="color"
                className={styles.colorCtrl}
                defaultValue={selectedElement.color || "#000000"}
                onChange={(e) => updateProp({ color: e.target.value })}
              />
              <span className={styles.colorHex}>
                {selectedElement.color || "#000000"}
              </span>
            </div>
          </div>

          {/* Position readout */}
          <div className={styles.row}>
            <span className={styles.lbl}>X</span>
            <span
              className={styles.val}
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {Math.round(selectedElement.x)}
            </span>
          </div>
          <div className={styles.row}>
            <span className={styles.lbl}>Y</span>
            <span
              className={styles.val}
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {Math.round(selectedElement.y)}
            </span>
          </div>
        </div>
      ) : (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <Layers size={12} /> Selection
          </div>
          <div className={styles.emptyHint}>
            Click any text in the PDF to select it, then double-click to edit
          </div>
        </div>
      )}

      {/* Actions */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>
          <FileText size={12} /> Actions
        </div>
        <div className={styles.actionList}>
          <button className={styles.actionBtn} onClick={handleWatermark}>
            <Droplets size={13} /> Add watermark
          </button>
          <button
            className={styles.actionBtn}
            onClick={() =>
              toast(
                "Switch to Redact tool in toolbar, then drag over content",
                { icon: "🔲" },
              )
            }
          >
            <EyeOff size={13} /> Redact content
          </button>
          <button
            className={styles.actionBtn}
            onClick={() =>
              toast("Password protection — use the Tools page", { icon: "🔒" })
            }
          >
            <Lock size={13} /> Password protect
          </button>
        </div>
      </div>

      {/* Export as */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Export as</div>
        <div className={styles.actionList}>
          <button
            className={styles.actionBtn}
            onClick={() => toast("DOCX export — v1.1", { icon: "📄" })}
          >
            📄 Word (.docx)
          </button>
          <button
            className={styles.actionBtn}
            onClick={() => toast("Image export — v1.1", { icon: "🖼" })}
          >
            🖼 Images (PNG)
          </button>
          <button
            className={styles.actionBtn}
            onClick={() => toast("Plain text export — v1.1", { icon: "📋" })}
          >
            📋 Plain text
          </button>
        </div>
      </div>
    </div>
  );
}
