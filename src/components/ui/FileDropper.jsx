import React from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileText, X } from "lucide-react";
import styles from "./FileDropper.module.css";

// Shared PDF file picker for the Tools screens — the single source of the
// drop-area / file-chip styles (Tools.module.css composes from here).
export default function FileDropper({
  onFile,
  file,
  onClear,
  multiple = false,
  label = "Drop PDF here or click to browse",
}) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "application/pdf": [".pdf"] },
    maxFiles: multiple ? undefined : 1,
    onDrop: multiple ? (files) => onFile(files) : ([f]) => f && onFile(f),
  });

  if (!multiple && file) {
    return (
      <div className={styles.fileChip}>
        <FileText size={15} />
        <span className={styles.fileName}>{file.name}</span>
        <span className={styles.fileSize}>
          {(file.size / 1024).toFixed(0)} KB
        </span>
        <button
          className={styles.removeBtn}
          onClick={onClear}
          aria-label="Remove file"
        >
          <X size={13} />
        </button>
      </div>
    );
  }

  return (
    <div
      {...getRootProps()}
      className={`${styles.dropArea} ${isDragActive ? styles.dropActive : ""}`}
    >
      <input {...getInputProps()} />
      <Upload size={28} />
      <span>{isDragActive ? "Drop it!" : label}</span>
    </div>
  );
}
