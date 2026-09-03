import { describe, it, expect } from "vitest";
import { generateSpanishTitle } from "./ocrTitles.js";

const okChat = (text) => async () => ({ ok: true, text });
const failChat = async () => ({ ok: false, code: "NO_KEY", message: "no" });

const CONTENT = [
  "## Page 1",
  "# Informe trimestral de facturación",
  "El cliente ACME debe pagar 142 dólares.",
].join("\n");

describe("generateSpanishTitle", () => {
  it("uses the model title, cleaned of quotes and newlines", async () => {
    const title = await generateSpanishTitle(
      CONTENT,
      okChat('"Informe de\n\nFacturación"'),
    );
    expect(title).toBe("Informe de Facturación");
  });

  it("strips markdown fences the model may wrap around the title", async () => {
    const title = await generateSpanishTitle(
      CONTENT,
      okChat("```\nInforme de Facturación\n```"),
    );
    expect(title).toBe("Informe de Facturación");
  });

  it("truncates over-long model titles to ~6 words", async () => {
    const title = await generateSpanishTitle(
      CONTENT,
      okChat(
        "Este es un título demasiado largo para el historial de documentos",
      ),
    );
    expect(title).toBe("Este es un título demasiado largo");
  });

  it("falls back to the derived title when the chat result is not ok", async () => {
    const title = await generateSpanishTitle(CONTENT, failChat);
    expect(title).toBe("Informe trimestral de facturación");
  });

  it("falls back to the derived title when the chat throws", async () => {
    const boom = async () => {
      throw new Error("network down");
    };
    const title = await generateSpanishTitle(CONTENT, boom);
    expect(title).toBe("Informe trimestral de facturación");
  });

  it("falls back when the model returns nothing usable", async () => {
    expect(await generateSpanishTitle(CONTENT, okChat("   "))).toBe(
      "Informe trimestral de facturación",
    );
    expect(await generateSpanishTitle(CONTENT, okChat('""'))).toBe(
      "Informe trimestral de facturación",
    );
  });

  it("never returns an empty title, even for empty content", async () => {
    expect(await generateSpanishTitle("", failChat)).toBe("Documento OCR");
    expect(await generateSpanishTitle("", okChat("  "))).toBe("Documento OCR");
  });

  it("passes only a bounded excerpt to the chat client", async () => {
    let seen = "";
    const spy = async (text) => {
      seen = text;
      return { ok: true, text: "Título" };
    };
    const long = "palabra ".repeat(2000);
    await generateSpanishTitle(long, spy);
    expect(seen.length).toBeLessThanOrEqual(1500);
  });
});
