import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";

// Integration gate for the custom-font tier in exportVectorPdf's getFont():
// each registry TTF must actually embed through pdf-lib + fontkit (subset
// enabled, exactly like the exporter does) and encode the multilingual
// sample the feature promises (es/en punctuation + accents + em dash).
const SPANISH_SAMPLE = "¡Diseño y acción, año 2026! — ¿ñandú?";

const FONT_FILES = [
  ["NotoSans", "noto-sans/400Regular/NotoSans_400Regular.ttf"],
  ["NotoSans", "noto-sans/700Bold/NotoSans_700Bold.ttf"],
  ["NotoSerif", "noto-serif/400Regular/NotoSerif_400Regular.ttf"],
  ["NotoSerif", "noto-serif/700Bold/NotoSerif_700Bold.ttf"],
  ["Lato", "lato/400Regular/Lato_400Regular.ttf"],
  ["Lato", "lato/700Bold/Lato_700Bold.ttf"],
  ["Merriweather", "merriweather/400Regular/Merriweather_400Regular.ttf"],
  ["Merriweather", "merriweather/700Bold/Merriweather_700Bold.ttf"],
].map(([family, rel]) => [
  family,
  resolve(__dirname, "../../node_modules/@expo-google-fonts", rel),
]);

describe("custom font embedding (vector export tier)", () => {
  for (const [family, path] of FONT_FILES) {
    it(`embeds ${family} (${path.split("/").pop()}) and encodes Spanish text`, async () => {
      const bytes = readFileSync(path);
      expect(bytes.byteLength).toBeGreaterThan(50_000);

      const doc = await PDFDocument.create();
      doc.registerFontkit(fontkit);
      const font = await doc.embedFont(bytes, { subset: true });

      // Same gates the exporter applies before using a font (encodeText
      // returns a PDFHexString; the point is it must not throw):
      const width = font.widthOfTextAtSize(SPANISH_SAMPLE, 12);
      expect(width).toBeGreaterThan(0);
      const encoded = font.encodeText(SPANISH_SAMPLE);
      expect(String(encoded.value ?? "").length).toBeGreaterThan(0);

      const page = doc.addPage([300, 120]);
      page.drawText(SPANISH_SAMPLE, {
        x: 12,
        y: 60,
        size: 12,
        font,
        color: rgb(0, 0, 0),
      });
      const saved = await doc.save();
      expect(saved.byteLength).toBeGreaterThan(1000);

      // Round-trip: reload and confirm the subset font survived the save.
      const reloaded = await PDFDocument.load(saved);
      expect(reloaded.getPageCount()).toBe(1);
    });
  }
});
