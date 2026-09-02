import React from "react";
import { Loader2 } from "lucide-react";
import styles from "./ActionBtn.module.css";

// Shared primary action button for the Tools screens — the single source of
// the .actionBtn styles (Tools.module.css composes from here).
export default function ActionBtn({
  onClick,
  disabled,
  loading,
  icon: Icon,
  children,
}) {
  return (
    <button
      className={styles.actionBtn}
      onClick={onClick}
      disabled={disabled || loading}
    >
      {loading ? (
        <Loader2 size={15} className={styles.spin} />
      ) : Icon ? (
        <Icon size={15} />
      ) : null}
      {children}
    </button>
  );
}
