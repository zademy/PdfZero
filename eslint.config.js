// ESLint 9 flat config. Scope: plain .js under src (lib/store/pages logic).
// JSX components are excluded until eslint-plugin-react is adopted —
// `npm run lint` previously failed repo-wide (ESLint 9 with no config at all).
import js from "@eslint/js";

const browserGlobals = {
  window: "readonly",
  document: "readonly",
  console: "readonly",
  fetch: "readonly",
  AbortController: "readonly",
  URL: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  requestAnimationFrame: "readonly",
  navigator: "readonly",
  localStorage: "readonly",
  FileReader: "readonly",
  Blob: "readonly",
  Worker: "readonly",
  CanvasRenderingContext2D: "readonly",
  ImageData: "readonly",
  OffscreenCanvas: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  getComputedStyle: "readonly",
  DOMParser: "readonly",
  XMLSerializer: "readonly",
  MutationObserver: "readonly",
  history: "readonly",
  location: "readonly",
  HTMLElement: "readonly",
  CustomEvent: "readonly",
};

export default [
  { ignores: ["**/*.jsx", "dist/", "node_modules/"] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...browserGlobals,
        process: "readonly",
        Buffer: "readonly",
        global: "readonly",
        module: "readonly",
        require: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        import: "readonly",
        exports: "readonly",
      },
    },
    rules: {
      // Repo convention: `catch (_) {}` for deliberate best-effort paths.
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
];
