// Thin configuration wrapper around @mdxeditor/editor for the OCR Scanner
// workspace (spec #6, ticket #8).
//
// Owns everything the editor needs to feel native here:
//   - the plugin set: everything applicable to OCR documents — headings,
//     lists, quote, thematic break, link + dialog, table, code block +
//     CodeMirror language map, image, directives (admonition), frontmatter,
//     markdown shortcuts, in-document search, rich↔source toggle and the
//     full (kitchen-sink) toolbar. Deliberately excluded per spec: sandpack
//     and JSX embedding.
//   - the image upload handler: files are read as data URLs and embedded in
//     the document — nothing ever leaves the browser.
//   - the dark theme over the app's design tokens (mdxEditorTheme.css).
//
// The parent drives content imperatively through the MDXEditorMethods ref
// (setMarkdown). The markdown prop is only the INITIAL value — feeding
// edits back into it is a documented performance trap, so onChange is used
// solely to keep the caller's document snapshot current (autosave seam).

import React, { forwardRef, useEffect, useRef, useState } from "react";
import {
  MDXEditor,
  toolbarPlugin,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  linkPlugin,
  linkDialogPlugin,
  tablePlugin,
  codeBlockPlugin,
  codeMirrorPlugin,
  imagePlugin,
  directivesPlugin,
  AdmonitionDirectiveDescriptor,
  frontmatterPlugin,
  markdownShortcutPlugin,
  searchPlugin,
  useEditorSearch,
  diffSourcePlugin,
  KitchenSinkToolbar,
  addComposerChild$,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import "./mdxEditorTheme.css";
import styles from "./MarkdownEditor.module.css";

const CODE_BLOCK_LANGUAGES = {
  txt: "Plain Text",
  js: "JavaScript",
  jsx: "JSX",
  ts: "TypeScript",
  tsx: "TSX",
  python: "Python",
  html: "HTML",
  css: "CSS",
  json: "JSON",
  yaml: "YAML",
  bash: "Bash",
  shell: "Shell",
  sql: "SQL",
  java: "Java",
  c: "C",
  cpp: "C++",
  cs: "C#",
  go: "Go",
  rust: "Rust",
  php: "PHP",
  ruby: "Ruby",
  markdown: "Markdown",
};

/** Images embed as data URLs — browser-only, no server, no upload. */
async function dataUrlImageUploadHandler(image) {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the image file."));
    reader.readAsDataURL(image);
  });
}

// v4's MDXEditor does not render React children — the sanctioned way to
// mount UI inside its realm is a plugin publishing the component to
// addComposerChild$ (same pattern as the built-in link dialog).
const searchUiPlugin = {
  init(realm) {
    realm.pub(addComposerChild$, SearchAddon);
  },
};

// Built once: the editor instance is initialized with this plugin array and
// swapping it later would rebuild the editor.
const PLUGINS = [
  toolbarPlugin({ toolbarContents: () => <KitchenSinkToolbar /> }),
  headingsPlugin(),
  listsPlugin(),
  quotePlugin(),
  thematicBreakPlugin(),
  linkPlugin(),
  linkDialogPlugin(),
  tablePlugin(),
  codeBlockPlugin({ defaultCodeBlockLanguage: "txt" }),
  codeMirrorPlugin({ codeBlockLanguages: CODE_BLOCK_LANGUAGES }),
  imagePlugin({ imageUploadHandler: dataUrlImageUploadHandler }),
  directivesPlugin({ directiveDescriptors: [AdmonitionDirectiveDescriptor] }),
  frontmatterPlugin(),
  markdownShortcutPlugin(),
  searchPlugin(),
  searchUiPlugin,
  diffSourcePlugin(),
];

// v4's searchPlugin ships the engine (highlighting, ranges, replace) but no
// UI — this addon is the app's search box, following the library's official
// pattern. Must render INSIDE <MDXEditor> to reach its realm.
function SearchAddon() {
  const {
    isSearchOpen,
    openSearch,
    closeSearch,
    search,
    setSearch,
    next,
    prev,
    ranges,
    cursor,
    replace,
    replaceAll,
  } = useEditorSearch();
  const inputRef = useRef(null);
  const [replacement, setReplacement] = useState("");

  useEffect(() => {
    if (isSearchOpen) inputRef.current?.select();
  }, [isSearchOpen]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "f" || e.key === "F")) {
        e.preventDefault();
        openSearch();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [openSearch]);

  if (!isSearchOpen) return null;

  return (
    <div className={styles.searchBox}>
      <input
        ref={inputRef}
        className={styles.searchInput}
        value={search}
        placeholder="Find"
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") closeSearch();
          if (e.key === "Enter") {
            e.preventDefault();
            if (e.shiftKey) prev();
            else next();
          }
        }}
      />
      <span className={styles.searchCount}>
        {ranges.length ? `${cursor}/${ranges.length}` : "0/0"}
      </span>
      <button
        type="button"
        className={styles.searchBtn}
        onClick={prev}
        title="Previous match (Shift+Enter)"
      >
        ↑
      </button>
      <button
        type="button"
        className={styles.searchBtn}
        onClick={next}
        title="Next match (Enter)"
      >
        ↓
      </button>
      <input
        className={styles.searchInput}
        value={replacement}
        placeholder="Replace"
        onChange={(e) => setReplacement(e.target.value)}
      />
      <button
        type="button"
        className={styles.searchBtn}
        onClick={() => replace(replacement)}
        title="Replace current match"
      >
        Replace
      </button>
      <button
        type="button"
        className={styles.searchBtn}
        onClick={() => replaceAll(replacement)}
        title="Replace all matches"
      >
        All
      </button>
      <button
        type="button"
        className={styles.searchBtn}
        onClick={closeSearch}
        title="Close (Esc)"
      >
        ✕
      </button>
    </div>
  );
}

const MarkdownEditor = forwardRef(function MarkdownEditor(
  { markdown = "", onChange, className = "", ...rest },
  ref,
) {
  return (
    <MDXEditor
      ref={ref}
      className={`ocrMdxEditor ${className}`.trim()}
      markdown={markdown}
      plugins={PLUGINS}
      onChange={onChange}
      {...rest}
    />
  );
});

export default MarkdownEditor;
