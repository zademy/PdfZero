import React from "react";
import { Copy, Download, FileText, Type, X } from "lucide-react";
import toast from "react-hot-toast";
import Markdown from "react-markdown";
import styles from "./OcrModal.module.css";

/**
 * Post-OCR review modal. Two views:
 * - Formatted: GLM-structured Markdown rendered read-only (the default when
 *   formatting succeeded) so the page's layout is visible at a glance.
 * - Raw: the plain OCR text, editable, used for copy-as-txt and for the
 *   insert-as-block action (text blocks don't render Markdown).
 */
export default function OcrModal({ result, onClose, onInsert }) {
  const [view, setView] = React.useState("formatted");
  const [rawDraft, setRawDraft] = React.useState(result?.raw ?? "");

  // Re-seed when a new OCR result opens the modal.
  React.useEffect(() => {
    setRawDraft(result?.raw ?? "");
    setView(result?.markdown ? "formatted" : "raw");
  }, [result]);

  // Escape closes (hooks must all run before the early return below).
  React.useEffect(() => {
    if (!result) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [result, onClose]);

  if (!result) return null;

  const hasMarkdown = !!result.markdown;
  const activeView = view === "formatted" && hasMarkdown ? "formatted" : "raw";
  const activeText = activeView === "formatted" ? result.markdown : rawDraft;
  const words = activeText.trim() ? activeText.trim().split(/\s+/).length : 0;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(activeText);
      toast.success(
        activeView === "formatted" ? "Markdown copied" : "Text copied",
        { duration: 1500 },
      );
    } catch {
      toast.error("Clipboard unavailable");
    }
  };

  const download = (content, filename) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadMd = () => {
    download(
      hasMarkdown ? result.markdown : rawDraft,
      `page-${result.page}-ocr.md`,
    );
    toast.success("Downloaded .md", { duration: 1500 });
  };

  const handleInsert = () => {
    if (!rawDraft.trim()) {
      toast.error("Nothing to insert");
      return;
    }
    onInsert(rawDraft);
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-label={`OCR result page ${result.page}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <div className={styles.title}>
            <span className={styles.page}>Page {result.page}</span>
            <span className={styles.engine}>{result.engine}</span>
            {hasMarkdown && (
              <div className={styles.viewToggle} role="tablist">
                <button
                  role="tab"
                  aria-selected={activeView === "formatted"}
                  className={`${styles.tab} ${activeView === "formatted" ? styles.tabActive : ""}`}
                  onClick={() => setView("formatted")}
                >
                  <FileText size={11} /> Formatted
                </button>
                <button
                  role="tab"
                  aria-selected={activeView === "raw"}
                  className={`${styles.tab} ${activeView === "raw" ? styles.tabActive : ""}`}
                  onClick={() => setView("raw")}
                >
                  <Type size={11} /> Raw
                </button>
              </div>
            )}
          </div>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close OCR results"
            title="Close (Esc)"
          >
            <X size={15} />
          </button>
        </div>

        {activeView === "formatted" ? (
          <div className={styles.prose}>
            <Markdown>{result.markdown}</Markdown>
          </div>
        ) : (
          <textarea
            className={styles.textarea}
            value={rawDraft}
            onChange={(e) => setRawDraft(e.target.value)}
            spellCheck={false}
            aria-label="OCR extracted text"
          />
        )}

        <div className={styles.footer}>
          <span className={styles.counter}>
            {activeText.length} chars · {words} words
          </span>
          <div className={styles.actions}>
            <button className={styles.btn} onClick={handleDownloadMd}>
              <Download size={13} /> Download .md
            </button>
            <button className={styles.btn} onClick={handleInsert}>
              <Type size={13} /> Insert as text block
            </button>
            <button className={styles.btnPrimary} onClick={handleCopy}>
              <Copy size={13} /> Copy
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
