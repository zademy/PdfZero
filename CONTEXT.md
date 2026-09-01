# PdfZero — Glossary

- **TextBlock**: a selectable piece of text on a page — either extracted from the original PDF or added by the user. Carries its own mini-toolbar (Edit, Duplicate, AI font match, Delete).
- **Extracted Edit**: a committed replacement of original PDF text. On export, the original run is whiteouted (per-block sampled background) and the replacement text is re-drawn in its place.
- **AI font match**: (planned) automatic matching of a browser-available substitute font to an embedded PDF font. Currently a placeholder in the TextBlock toolbar.
- **Translation**: replacing a TextBlock's text with its equivalent in the other language (English↔Spanish, direction auto-detected). Shown as an editable preview; once applied, it becomes an Extracted Edit like any manual text edit.
- **Non-destructive editing**: original file bytes are never mutated; all changes live as overlays/edits until export re-draws them onto a copy.
- **Font choice**: one logical concept with two coupled fields — `fontName` (the export key) and `fontFamily` (the CSS stack for canvas render/measure). Always changed together through `store.setFont`; the font registry (`fontRegistry.js`) owns classification and the family list.
- **OCR run**: one recognition pass over the current page (`ocrPipeline.ocrPage`), producing `{ raw, markdown?, engine }` from the local Ollama GLM OCR model — the only engine. Runs land in the **OCR history** (max 3, newest first) and reopen in the review modal.
- **OCR block**: a chunk of OCR text separated by blank lines — the unit the cleanup pipeline labels and acts on. _Avoid_: segment (reserved for the translation boxes).
- **Echo**: an OCR block that redundantly repeats content already kept — a consecutive duplicate, a truncated prefix of the previous block, or an internal run of identical lines. Dropped on cleanup; genuine non-consecutive repetition (recurring headers) is not echo.
- **Heading fragment**: one of up to three short consecutive OCR blocks that form a single heading; merged into one block on cleanup.
- **Export mode**: the export strategy is explicit — `visual` (raster snapshot, appearance-faithful), `vector` (real selectable text), or `auto` (default: visual-first with vector fallback).
