// OCR Scanner workspace (spec #6, ticket #8): the two-zone screen that
// replaces the scanner's old "run → download .txt" flow.
//
//   left zone   — drop zone, Run OCR with per-page progress, then the
//                 markdown editor showing the assembled OCR document
//   right zone  — minimal document panel: page count, partial-format badge
//                 and .md/.txt export (grows into the history panel in #9)
//
// The run consumes the #7 seams: ocrPage (recognition, formatting off) →
// formatWithRetry (3 attempts per page around the GLM formatter) →
// assembleOcrDocument (page headings + thematic breaks + fallback notes).
// Without a GLM API key, Run OCR is disabled with an alert explaining how
// to configure the model — the PDF editor's page-level OCR flow is not
// affected (ADR 0002 governs the engine, not this formatting gate).

import React, { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  ScanLine,
  FileText,
  FileCode2,
  FileDown,
  TriangleAlert,
} from "lucide-react";
import FileDropper from "../ui/FileDropper.jsx";
import ActionBtn from "../ui/ActionBtn.jsx";
import { loadPdf } from "../../lib/pdfRenderer.js";
import { ocrPage, OcrUnavailableError } from "../../lib/ocrPipeline.js";
import { formatOcrMarkdown } from "../../lib/ocrFormat.js";
import { assembleOcrDocument, formatWithRetry } from "../../lib/ocrDocument.js";
import { getGlmApiKey } from "../../lib/translation.js";
import { downloadBytes } from "../../lib/pdfExporter.js";
import { markdownToPlainText } from "../../lib/markdownText.js";
import MarkdownEditor from "./MarkdownEditor.jsx";
import styles from "./OcrScannerWorkspace.module.css";

export default function OcrScannerWorkspace({ onDocumentChange }) {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ page: 0, total: 0 });
  const [doc, setDoc] = useState(null);
  const editorRef = useRef(null);
  const mdRef = useRef("");
  // Build-time gate: the key ships with the bundle, so read it once.
  const hasGlmKey = Boolean(getGlmApiKey());

  useEffect(() => {
    onDocumentChange?.(Boolean(doc));
  }, [doc, onDocumentChange]);

  const handleRun = async () => {
    if (!file || busy) return;
    setBusy(true);
    setProgress({ page: 0, total: 0 });
    const tid = toast.loading("Detecting OCR engine...");
    try {
      const buf = await file.arrayBuffer();
      const pdf = await loadPdf(buf.slice(0));
      const total = pdf.numPages;
      const results = [];

      for (let p = 1; p <= total; p += 1) {
        toast.loading(`Scanning page ${p} of ${total}...`, { id: tid });
        const { raw } = await ocrPage(p, { format: false });
        toast.loading(`Formatting page ${p} of ${total}...`, { id: tid });
        const markdown = await formatWithRetry(raw, formatOcrMarkdown);
        results.push({ page: p, raw, markdown });
        setProgress({ page: p, total });
      }

      const { markdown, partialFormat } = assembleOcrDocument(results);
      mdRef.current = markdown;
      editorRef.current?.setMarkdown(markdown);
      setDoc({
        pages: total,
        partialFormat,
        baseName: file.name.replace(/\.pdf$/i, ""),
      });
      toast.success(`OCR complete — ${total} page${total === 1 ? "" : "s"}`, {
        id: tid,
      });
      if (partialFormat) {
        toast(
          "Some pages could not be formatted — their headings carry a note and the raw text.",
          { icon: "⚠️" },
        );
      }
    } catch (e) {
      toast.error(
        e instanceof OcrUnavailableError
          ? e.message
          : "OCR failed: " + e.message,
        { id: tid },
      );
    }
    setBusy(false);
    setProgress({ page: 0, total: 0 });
  };

  const handleExport = (kind) => {
    const text =
      kind === "md" ? mdRef.current : markdownToPlainText(mdRef.current);
    if (!text.trim()) {
      toast.error("Nothing to export — run OCR first.");
      return;
    }
    const base = doc?.baseName || "document";
    downloadBytes(
      new TextEncoder().encode(text),
      `${base}-ocr.${kind}`,
      kind === "md" ? "text/markdown" : "text/plain",
    );
    toast.success(
      `Exported ${kind === "md" ? "Markdown" : "plain text"} — ${base}-ocr.${kind}`,
    );
  };

  const pct = progress.total
    ? Math.round((progress.page / progress.total) * 100)
    : 0;

  return (
    <div className={styles.workspace}>
      <section className={styles.runZone}>
        <FileDropper
          file={file}
          onFile={setFile}
          onClear={() => setFile(null)}
        />

        {busy && (
          <div className={styles.progressRow}>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className={styles.progressLabel}>
              page {progress.page}/{progress.total || "?"}
            </span>
          </div>
        )}

        <ActionBtn
          onClick={handleRun}
          disabled={!file || !hasGlmKey}
          loading={busy}
          icon={ScanLine}
        >
          {busy
            ? `Scanning... ${progress.total ? Math.round((progress.page / progress.total) * 100) : 0}%`
            : "Run OCR"}
        </ActionBtn>

        {!hasGlmKey && (
          <div className={styles.keyAlert} role="alert">
            <TriangleAlert size={16} />
            <div>
              <strong>GLM formatting is not configured.</strong>
              <p>
                Set <code>VITE_GLM_API_KEY</code> in <code>.env.local</code> and
                restart the dev server to enable OCR runs. Recognition itself
                still runs locally with Ollama glm-ocr.
              </p>
            </div>
          </div>
        )}
      </section>

      <div className={styles.mainZones}>
        <section className={styles.editorZone}>
          {doc ? (
            <MarkdownEditor
              ref={editorRef}
              markdown={mdRef.current}
              onChange={(md) => {
                mdRef.current = md;
              }}
            />
          ) : (
            <div className={styles.editorEmpty}>
              Run OCR to open the recognized document here — review, fix and
              enrich it, then export.
            </div>
          )}
        </section>

        {doc && (
          <aside className={styles.exportPanel}>
            <header className={styles.panelHeader}>
              <FileText size={14} />
              <span>Document</span>
            </header>
            <div className={styles.docMeta}>
              <span className={styles.docName}>{doc.baseName}</span>
              <span className={styles.docPages}>
                {doc.pages} page{doc.pages === 1 ? "" : "s"}
              </span>
              {doc.partialFormat && (
                <span className={styles.partialBadge}>partial format</span>
              )}
            </div>
            <button
              className={styles.exportBtn}
              onClick={() => handleExport("md")}
            >
              <FileCode2 size={14} /> Export .md
            </button>
            <button
              className={styles.exportBtn}
              onClick={() => handleExport("txt")}
            >
              <FileDown size={14} /> Export .txt
            </button>
          </aside>
        )}
      </div>
    </div>
  );
}
