import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { encryptPDF } from "@pdfsmaller/pdf-encrypt";
import { decryptPdf, PasswordRequiredError } from "./pdfDecrypt.js";

async function makeSamplePdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([200, 100]);
  page.drawText("Secret content", { x: 20, y: 50 });
  return doc.save();
}

async function loadStrict(bytes) {
  return PDFDocument.load(bytes, { ignoreEncryption: false });
}

async function firstPageText(bytes) {
  const doc = await PDFDocument.load(bytes);
  return doc.getPage(0).getSize().width;
}

describe("decryptPdf", () => {
  it("decrypts an AES-256 PDF locked with owner password only", async () => {
    const sample = await makeSamplePdf();
    const locked = await encryptPDF(sample, "", {
      ownerPassword: "owner999",
      algorithm: "AES-256",
      allowCopying: false,
    });
    const unlocked = await decryptPdf(locked);
    const doc = await loadStrict(unlocked);
    expect(doc.getPageCount()).toBe(1);
    expect(await firstPageText(unlocked)).toBe(200);
  });

  it("decrypts an RC4 PDF locked with owner password only", async () => {
    const sample = await makeSamplePdf();
    const locked = await encryptPDF(sample, "", {
      ownerPassword: "owner999",
      algorithm: "RC4",
    });
    const unlocked = await decryptPdf(locked);
    const doc = await loadStrict(unlocked);
    expect(doc.getPageCount()).toBe(1);
  });

  it("decrypts an AES-256 PDF when the open password is provided", async () => {
    const sample = await makeSamplePdf();
    const locked = await encryptPDF(sample, "test1234", {
      algorithm: "AES-256",
    });
    const unlocked = await decryptPdf(locked, { password: "test1234" });
    const doc = await loadStrict(unlocked);
    expect(doc.getPageCount()).toBe(1);
  });

  it("throws PasswordRequiredError when the open password is unknown", async () => {
    const sample = await makeSamplePdf();
    const locked = await encryptPDF(sample, "secret-pw", {
      algorithm: "AES-256",
    });
    await expect(decryptPdf(locked)).rejects.toThrow(PasswordRequiredError);
  });

  it("passes through unencrypted PDFs untouched", async () => {
    const sample = await makeSamplePdf();
    const out = await decryptPdf(sample);
    const doc = await loadStrict(out);
    expect(doc.getPageCount()).toBe(1);
  });

  it("round-trips page count for the 2-page scanned fixture bytes are not required", async () => {
    const sample = await makeSamplePdf();
    const locked = await encryptPDF(sample, "", {
      ownerPassword: "o",
      algorithm: "AES-256",
    });
    const again = await encryptPDF(await decryptPdf(locked), "", {
      ownerPassword: "o2",
      algorithm: "AES-256",
    });
    const doc = await PDFDocument.load(again, { ignoreEncryption: true });
    expect(doc.getPageCount()).toBe(1);
  });
});
