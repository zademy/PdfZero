import React from "react";
import { Copy, Download, TextCursorInput, X } from "lucide-react";
import toast from "react-hot-toast";
import styles from "./OcrModal.module.css";

/**
 * Post-OCR review modal: editable extracted text with copy / export /
 * insert-as-block actions. Pure presentational — the text lives in local
 * state seeded from the OCR result so the user can fix recognition errors
 * before copying or inserting.
 */
export default function OcrModal({ result, onClose, onInsert }) {
  const [text, setText] = React.useState(result?.text ?? "");

  // Re-seed the draft whenever a new OCR result opens the modal.
  React.useEffect(() => {
    setText(result?.text ?? "");
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

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard", { duration: 1500 });
    } catch {
      toast.error("Clipboard unavailable");
    }
  };

  const handleDownload = () => {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `page-${result.page}-ocr.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded .txt", { duration: 1500 });
  };

  const handleInsert = () => {
    if (!text.trim()) {
      toast.error("Nothing to insert");
      return;
    }
    onInsert(text);
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

        <textarea
          className={styles.textarea}
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          aria-label="OCR extracted text"
        />

        <div className={styles.footer}>
          <span className={styles.counter}>
            {text.length} chars · {words} words
          </span>
          <div className={styles.actions}>
            <button className={styles.btn} onClick={handleDownload}>
              <Download size={13} /> Download .txt
            </button>
            <button className={styles.btn} onClick={handleInsert}>
              <TextCursorInput size={13} /> Insert as text block
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
