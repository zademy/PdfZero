import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { createRequire } from "module";

// package.json is the single source of truth for the version; inject it at
// build time so the navbar badge (and anything else) reads __APP_VERSION__.
const { version } = createRequire(import.meta.url)("./package.json");

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
    },
  },
  optimizeDeps: {
    exclude: ["pdfjs-dist"],
  },
  worker: {
    format: "es",
  },
  build: {
    rollupOptions: {
      output: {
        // Vite 8 (rolldown) replaced manualChunks with codeSplitting
        // groups. Same goal: keep the two PDF engines in their own chunks.
        codeSplitting: {
          groups: [
            { name: "pdf-lib", test: /pdf-lib/ },
            { name: "pdfjs", test: /pdfjs-dist/ },
            { name: "mdxeditor", test: /@mdxeditor/ },
          ],
        },
      },
    },
  },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
