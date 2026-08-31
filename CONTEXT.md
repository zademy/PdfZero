# PdfZero — Glossary

- **TextBlock**: a selectable piece of text on a page — either extracted from the original PDF or added by the user. Carries its own mini-toolbar (Edit, Duplicate, AI font match, Delete).
- **Extracted Edit**: a committed replacement of original PDF text. On export, the original run is whiteouted (per-block sampled background) and the replacement text is re-drawn in its place.
- **AI font match**: (planned) automatic matching of a browser-available substitute font to an embedded PDF font. Currently a placeholder in the TextBlock toolbar.
- **Translation**: replacing a TextBlock's text with its equivalent in the other language (English↔Spanish, direction auto-detected). Shown as an editable preview; once applied, it becomes an Extracted Edit like any manual text edit.
- **Non-destructive editing**: original file bytes are never mutated; all changes live as overlays/edits until export re-draws them onto a copy.
