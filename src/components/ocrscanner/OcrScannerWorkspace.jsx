// OCR Scanner workspace (spec #6, tickets #8–#9): run → markdown editor,
// with a persistent document archive.
//
//   left zone   — drop zone, Run OCR with per-page progress, then the
//                 markdown editor showing the assembled OCR document
//   right zone  — document panel: current document (pages, partial-format
//                 badge, .md/.txt export) and the OCR document history
//                 (IndexedDB): click reopens, trash deletes, newest first
//
// Persistence goes through the ocrDocumentStore seam (#9): every run
// creates a NEW document; edits autosave with a ~1s debounce via the
// editor's onChange (which never feeds back into the markdown prop).
// Content swaps are imperative (ref.setMarkdown); when the editor is not
// mounted, mdRef.current seeds the initial markdown prop on mount.
//
// The GLM-key gate (Run disabled + alert without VITE_GLM_API_KEY) and the
// PDF editor's page-level OCR flow remain untouched (ADR 0002).

import React, { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  ScanLine,
  FileText,
  FileCode2,
  FileDown,
  TriangleAlert,
  Trash2,
  History,
} from "lucide-react";
import FileDropper from "../ui/FileDropper.jsx";
import ActionBtn from "../ui/ActionBtn.jsx";
import { loadPdf } from "../../lib/pdfRenderer.js";
import { ocrPage, OcrUnavailableError } from "../../lib/ocrPipeline.js";
import { formatOcrMarkdown } from "../../lib/ocrFormat.js";
import { assembleOcrDocument, formatWithRetry } from "../../lib/ocrDocument.js";
import { openOcrDocumentStore } from "../../lib/ocrDocumentStore.js";
import { getGlmApiKey } from "../../lib/translation.js";
import { downloadBytes } from "../../lib/pdfExporter.js";
import { markdownToPlainText } from "../../lib/markdownText.js";
import MarkdownEditor from "./MarkdownEditor.jsx";
import styles from "./OcrScannerWorkspace.module.css";

const AUTOSAVE_DELAY_MS = 1000;

function formatWhen(ts) {
  return new Date(ts).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

export default function OcrScannerWorkspace({ onExpandChange }) {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ page: 0, total: 0 });
  const [docs, setDocs] = useState([]);
  const [current, setCurrent] = useState(null);
  const [storeError, setStoreError] = useState(false);
  const editorRef = useRef(null);
  const mdRef = useRef("");
  const storeRef = useRef(null);
  const currentRef = useRef(null);
  const saveTimerRef = useRef(null);
  // Build-time gate: the key ships with the bundle, so read it once.
  const hasGlmKey = Boolean(getGlmApiKey());

  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  // Open the archive once; the history panel works across sessions.
  useEffect(() => {
    let alive = true;
    openOcrDocumentStore()
      .then(async (store) => {
        storeRef.current = store;
        if (alive) setDocs(await store.list());
      })
      .catch(() => {
        if (alive) setStoreError(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const hasArchive = Boolean(current) || docs.length > 0;
  useEffect(() => {
    onExpandChange?.(hasArchive);
  }, [hasArchive, onExpandChange]);

  const refreshList = async () => {
    if (!storeRef.current) return;
    try {
      setDocs(await storeRef.current.list());
    } catch {
      /* keep the previous list */
    }
  };

  const saveNow = async () => {
    clearTimeout(saveTimerRef.current);
    const cur = currentRef.current;
    if (!cur || !storeRef.current) return;
    try {
      await storeRef.current.save({ ...cur, markdown: mdRef.current });
    } catch {
      toast.error("Could not autosave the document.");
    }
  };

  const scheduleAutosave = () => {
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void saveNow();
    }, AUTOSAVE_DELAY_MS);
  };

  useEffect(() => () => clearTimeout(saveTimerRef.current), []);

  const openDocument = async (doc) => {
    await saveNow(); // flush pending edits of the document being left
    mdRef.current = doc.markdown;
    editorRef.current?.setMarkdown(doc.markdown);
    setCurrent(doc);
  };

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
      let engine = "";

      for (let p = 1; p <= total; p += 1) {
        toast.loading(`Scanning page ${p} of ${total}...`, { id: tid });
        const {
          raw,
          markdown: pageMd,
          engine: pageEngine,
        } = await ocrPage(p, {
          format: false,
        });
        toast.loading(`Formatting page ${p} of ${total}...`, { id: tid });
        const markdown = await formatWithRetry(raw, formatOcrMarkdown);
        engine = engine || pageEngine;
        results.push({ page: p, raw, markdown });
        setProgress({ page: p, total });
      }

      const { markdown, partialFormat } = assembleOcrDocument(results);
      const baseName = file.name.replace(/\.pdf$/i, "");
      const doc = {
        id: crypto.randomUUID(),
        title: baseName,
        markdown,
        meta: {
          sourceName: baseName,
          pages: total,
          engine,
          createdAt: Date.now(),
          partialFormat,
        },
      };
      if (storeRef.current) {
        try {
          await storeRef.current.save(doc);
          await refreshList();
        } catch {
          toast.error("Could not save the document to the archive.");
        }
      }
      mdRef.current = markdown;
      editorRef.current?.setMarkdown(markdown);
      setCurrent(doc);
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

  const handleDelete = async (id) => {
    if (!storeRef.current) return;
    try {
      await storeRef.current.remove(id);
    } catch {
      toast.error("Could not delete the document.");
      return;
    }
    if (currentRef.current?.id === id) {
      clearTimeout(saveTimerRef.current);
      setCurrent(null);
      mdRef.current = "";
    }
    await refreshList();
  };

  const handleExport = (kind) => {
    const text =
      kind === "md" ? mdRef.current : markdownToPlainText(mdRef.current);
    if (!text.trim()) {
      toast.error("Nothing to export — run OCR first.");
      return;
    }
    const base = current?.title || current?.meta?.sourceName || "document";
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

      {hasArchive && (
        <div className={styles.mainZones}>
          <section className={styles.editorZone}>
            {current ? (
              <MarkdownEditor
                ref={editorRef}
                markdown={mdRef.current}
                onChange={(md) => {
                  mdRef.current = md;
                  scheduleAutosave();
                }}
              />
            ) : (
              <div className={styles.editorEmpty}>
                Pick a document from the archive — or run OCR on a new PDF.
              </div>
            )}
          </section>

          <aside className={styles.exportPanel}>
            {current && (
              <>
                <header className={styles.panelHeader}>
                  <FileText size={14} />
                  <span>Document</span>
                </header>
                <div className={styles.docMeta}>
                  <span className={styles.docName}>{current.title}</span>
                  <span className={styles.docPages}>
                    {current.meta.pages} page
                    {current.meta.pages === 1 ? "" : "s"}
                  </span>
                  {current.meta.partialFormat && (
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
              </>
            )}

            <header className={styles.panelHeader}>
              <History size={14} />
              <span>Archive</span>
            </header>
            {storeError ? (
              <p className={styles.storeError}>
                Document archive is unavailable (IndexedDB error).
              </p>
            ) : docs.length === 0 ? (
              <p className={styles.archiveEmpty}>
                No documents yet — each OCR run creates one.
              </p>
            ) : (
              <ul className={styles.historyList}>
                {docs.map((d) => (
                  <li key={d.id}>
                    <button
                      className={`${styles.historyItem} ${current?.id === d.id ? styles.historyActive : ""}`}
                      onClick={() => openDocument(d)}
                      title={d.title}
                    >
                      <FileText size={14} className={styles.historyIcon} />
                      <span className={styles.historyInfo}>
                        <span className={styles.historyTitle}>{d.title}</span>
                        <span className={styles.historyMeta}>
                          {formatWhen(d.meta.createdAt)} · {d.meta.pages}p
                          {d.meta.partialFormat ? " · partial" : ""}
                        </span>
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        className={styles.historyDelete}
                        aria-label={`Delete ${d.title}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDelete(d.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.stopPropagation();
                            void handleDelete(d.id);
                          }
                        }}
                      >
                        <Trash2 size={13} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
