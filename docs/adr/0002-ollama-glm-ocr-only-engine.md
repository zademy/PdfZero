# GLM OCR on local Ollama is the only OCR engine

We removed the bundled tesseract.js fallback: every OCR run goes through the local Ollama glm-ocr model, keeping the app dependency-light and fully local — no OCR workers shipped in the bundle, no `terminateOcr` lifecycle to leak. When Ollama or the glm-ocr model is absent, OCR fails with a clear typed error surfaced as a toast instead of silently degrading to a second engine. COOP/COEP dev-server headers stay for now (they were load-bearing for tesseract workers); removing them is a separate cleanup.

## Considered Options

- Keep tesseract as a hidden fallback — rejected: two engines to maintain for a path the product no longer wants, and the fallback masked the "Ollama missing" signal we now want users to see.
