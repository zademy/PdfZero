# Contributing to PDFZero

Thanks for your interest in contributing! PRs are welcome — against **this fork**
([zademy/PdfZero](https://github.com/zademy/PdfZero)), not upstream.

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Getting started

```bash
git clone https://github.com/zademy/PdfZero.git
cd PdfZero
npm install

# Optional — enable AI translation (EN↔ES) during development
cp .env.example .env.local
# set VITE_GLM_API_KEY in .env.local

npm run dev      # Vite dev server (needs the COOP/COEP headers in vite.config.js)
npm run build    # production build
npm test         # Vitest unit tests
npm run lint     # ESLint
npm run format   # Prettier
```

## Ground rules

1. **Open an issue first** for bug fixes with unclear cause and for any feature
   or breaking change, so we can align before you write code.
2. **Keep logic out of components.** Pure logic belongs in `src/lib/` (plain
   JavaScript, no React); the store lives in `src/store/pdfStore.js`.
3. **Respect the two-engine rule.** `pdfjs-dist` (`src/lib/pdfRenderer.js`) is
   the READ side; `pdf-lib` (`src/lib/pdfExporter.js`) is the WRITE side.
   Never cross the roles; coordinate-system conversions live in the
   exporter/layout code only.
4. **Editing is non-destructive.** Original file bytes are never mutated —
   edits are overlays in the store. Nothing non-serializable (DOM nodes, refs)
   may enter edit state (history deep-clones it as JSON).
5. **Don't "simplify" build config.** `optimizeDeps.exclude`, `worker.format`,
   manual chunks, and the COOP/COEP dev headers in `vite.config.js` are
   load-bearing for pdfjs/tesseract workers.

## Conventions

- Plain JavaScript (JSX) — no TypeScript.
- CSS Modules per component + `styles/globals.css` tokens. No Tailwind, no CSS-in-JS.
- Icons: `lucide-react`. Classes: `clsx`. Toasts: `react-hot-toast`.
- Relative imports (`../lib/...`), components PascalCase `.jsx`, lib files camelCase `.js`.

## Before you open a PR

- Run `npm run lint`, `npm test`, and `npm run build` and make sure they pass.
- Add or update tests for changed behavior in `src/lib/` or the store.
- Keep PRs small and focused; describe what changed and why, linking the issue.

## Reporting bugs

Open an issue with: browser + OS, steps to reproduce, and (if possible) the
PDF that triggers it. Security issues follow [SECURITY.md](SECURITY.md) instead.
