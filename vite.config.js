import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
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
