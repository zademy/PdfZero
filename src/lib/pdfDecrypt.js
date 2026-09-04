/**
 * PDF Standard-security-handler decryption (the missing inverse of
 * `@pdfsmaller/pdf-encrypt`). Supports:
 *   - AES-256 (V=5, R=6) — ISO 32000-2 Algorithms 2.B (key derivation from
 *     U/UE or O/OE) and per-object AESV3 (file key used directly).
 *   - RC4 40/128 (V=1/V=2, R=2/R=3) and AES-128 (V=4, AESV2) — Algorithm 2
 *     key derivation plus per-object key md5(fileKey + objNum + genNum).
 *
 * Only the Standard handler is handled, which is what every mainstream
 * producer (Acrobat, pdf.js, @pdfsmaller/pdf-encrypt) emits.
 *
 * The crypto primitives are re-imported from `@pdfsmaller/pdf-encrypt` —
 * no new dependency.
 */
import {
  PDFDocument,
  PDFDict,
  PDFArray,
  PDFName,
  PDFNumber,
  PDFString,
  PDFHexString,
  PDFRawStream,
} from "pdf-lib";
import {
  md5,
  RC4,
  computeHash2B,
  encodePasswordAES256,
  encodePasswordLegacy,
} from "@pdfsmaller/pdf-encrypt";

export class PasswordRequiredError extends Error {
  constructor() {
    super(
      "This PDF needs its open password to be unlocked. Enter the password and try again.",
    );
    this.name = "PasswordRequiredError";
    this.code = "PASSWORD_REQUIRED";
  }
}

const PADDING = new Uint8Array([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff,
  0xfa, 0x01, 0x08, 0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c,
  0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
]);

const u8 = (...parts) => {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

const le32 = (n) =>
  new Uint8Array([
    n & 0xff,
    (n >> 8) & 0xff,
    (n >> 16) & 0xff,
    (n >>> 24) & 0xff,
  ]);

const le24 = (n) =>
  new Uint8Array([n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff]);

const bytesToHex = (bytes) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

function bytesToPDFStringValue(bytes) {
  let out = "";
  for (const b of bytes) {
    if (b === 0x5c) out += "\\\\";
    else if (b === 0x28) out += "\\(";
    else if (b === 0x29) out += "\\)";
    else if (b === 0x0d) out += "\\r";
    else if (b === 0x0a) out += "\\n";
    else out += String.fromCharCode(b);
  }
  return out;
}

// AES-CBC decryption without padding — WebCrypto always strips PKCS#7 from
// the last block, so append one synthetic ciphertext block whose decryption
// is a full 16-byte padding block (0x10). Built by ENCRYPTING that padding
// block with the same key, chaining from the last real ciphertext block.
async function aesCbcDecryptNoPad(data, rawKey) {
  if (data.length === 0 || data.length % 16 !== 0) {
    throw new Error("AES-CBC no-padding decrypt: bad ciphertext length");
  }
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "AES-CBC" },
    false,
    ["encrypt", "decrypt"],
  );
  const padBlock = new Uint8Array(16).fill(16);
  const lastC = data.slice(data.length - 16);
  const synth = new Uint8Array(
    await globalThis.crypto.subtle.encrypt({ name: "AES-CBC", iv: lastC }, key, padBlock),
  ).slice(0, 16);
  const plain = new Uint8Array(
    await globalThis.crypto.subtle.decrypt(
      { name: "AES-CBC", iv: new Uint8Array(16) },
      key,
      u8(data, synth),
    ),
  );
  if (plain.length !== data.length) {
    throw new Error("AES-CBC no-padding decrypt: unexpected length");
  }
  return plain;
}

async function aesCbcDecrypt(data, rawKey, iv) {
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "AES-CBC" },
    false,
    ["decrypt"],
  );
  return new Uint8Array(
    await globalThis.crypto.subtle.decrypt({ name: "AES-CBC", iv }, key, data),
  );
}

// ---------- key derivation: R6 (AES-256) ----------

async function fileKeyR6(passwordBytes, U, UE, O, OE) {
  // user password: hash(pw, U[32:40]) must match U[0:32]; key from UE
  if (U && U.length === 48 && UE) {
    const vHash = await computeHash2B(
      passwordBytes,
      U.slice(32, 40),
      new Uint8Array(0),
    );
    if (
      vHash.length >= 32 &&
      bytesToHex(vHash.slice(0, 32)) === bytesToHex(U.slice(0, 32))
    ) {
      const kHash = await computeHash2B(
        passwordBytes,
        U.slice(40, 48),
        new Uint8Array(0),
      );
      return aesCbcDecryptNoPad(UE, kHash.slice(0, 32));
    }
  }
  // owner password: hash(pw, O[32:40], U) must match O[0:32]; key from OE
  if (O && O.length === 48 && OE && U) {
    const vHash = await computeHash2B(passwordBytes, O.slice(32, 40), U);
    if (
      vHash.length >= 32 &&
      bytesToHex(vHash.slice(0, 32)) === bytesToHex(O.slice(0, 32))
    ) {
      const kHash = await computeHash2B(passwordBytes, O.slice(40, 48), U);
      return aesCbcDecryptNoPad(OE, kHash.slice(0, 32));
    }
  }
  return null;
}

// ---------- key derivation: R2/R3/R4 (RC4 / AESV2) ----------

function padLegacy(passwordBytes) {
  const padded = new Uint8Array(32);
  if (passwordBytes.length >= 32) padded.set(passwordBytes.slice(0, 32));
  else {
    padded.set(passwordBytes);
    padded.set(
      PADDING.slice(0, 32 - passwordBytes.length),
      passwordBytes.length,
    );
  }
  return padded;
}

function fileKeyLegacy(passwordBytes, O, permissions, fileId, keyLength) {
  const hash = md5(
    u8(padLegacy(passwordBytes), O, le32(permissions | 0), fileId),
  );
  let key = hash.slice(0, keyLength);
  for (let i = 0; i < 50; i++) key = md5(key).slice(0, keyLength);
  return key;
}

function validateLegacyUserKey(
  passwordBytes,
  O,
  permissions,
  fileId,
  keyLength,
  U,
  R,
) {
  const key = fileKeyLegacy(passwordBytes, O, permissions, fileId, keyLength);
  if (R === 2) {
    const rc4 = new RC4(key);
    const expect = rc4.process(PADDING);
    return bytesToHex(expect) === bytesToHex(U.slice(0, 16));
  }
  let hash = md5(u8(PADDING, fileId));
  const rc4 = new RC4(key);
  hash = rc4.process(hash);
  for (let i = 1; i <= 19; i++) {
    const iterKey = new Uint8Array(key.length);
    for (let j = 0; j < key.length; j++) iterKey[j] = key[j] ^ i;
    hash = new RC4(iterKey).process(hash);
  }
  return bytesToHex(hash.slice(0, 16)) === bytesToHex(U.slice(0, 16));
}

function objectKeyLegacy(fileKey, objectNum, generationNum) {
  const digest = md5(
    u8(
      fileKey,
      le24(objectNum),
      new Uint8Array([generationNum & 0xff, (generationNum >> 8) & 0xff]),
    ),
  );
  return digest.slice(0, Math.min(fileKey.length + 5, 16));
}

// ---------- main ----------

function dictBytes(dict, name) {
  const v = dict.get(PDFName.of(name));
  return v && typeof v.asBytes === "function" ? v.asBytes() : null;
}

function dictNumber(dict, name) {
  const v = dict.get(PDFName.of(name));
  return v instanceof PDFNumber ? v.asNumber() : null;
}

/**
 * Decrypt a Standard-handler encrypted PDF and return clean, unencrypted
 * bytes. Tries the empty user password first (restriction-only PDFs), then
 * the owner password path, then `options.password` if provided.
 *
 * @param {Uint8Array|ArrayBuffer} pdfBytes
 * @param {{ password?: string }} [options]
 * @returns {Promise<Uint8Array>} unencrypted PDF bytes
 * @throws {PasswordRequiredError} when no tried password opens the document
 */
export async function decryptPdf(pdfBytes, options = {}) {
  const input =
    pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes);
  const doc = await PDFDocument.load(input, {
    ignoreEncryption: true,
    updateMetadata: false,
  });

  const trailer = doc.context.trailerInfo;
  const encryptRef = trailer.Encrypt;
  if (!encryptRef) return doc.save({ useObjectStreams: false });

  const enc = doc.context.lookup(encryptRef, PDFDict);
  if (!enc) return doc.save({ useObjectStreams: false });
  const filter = enc.get(PDFName.of("Filter"));
  if (filter && filter.toString() !== "/Standard") {
    throw new Error("Unsupported encryption filter: " + filter.toString());
  }

  const V = dictNumber(enc, "V");
  const R = dictNumber(enc, "R");
  const permissions = dictNumber(enc, "P") | 0;
  const O = dictBytes(enc, "O");
  const U = dictBytes(enc, "U");
  const UE = dictBytes(enc, "UE");
  const OE = dictBytes(enc, "OE");

  const idArray = trailer.ID;
  const idFirst =
    idArray instanceof PDFArray
      ? idArray.get(0)
      : Array.isArray(idArray)
        ? idArray[0]
        : undefined;
  const fileId =
    idFirst && typeof idFirst.asBytes === "function"
      ? idFirst.asBytes()
      : new Uint8Array(0);

  // crypt filter method: AESV3 | AESV2 | RC4 (V2 / default)
  let cfm = null;
  const cf = enc.get(PDFName.of("CF"));
  if (cf) {
    const cfDict = doc.context.lookup(cf, PDFDict);
    const stdCFRef = cfDict && cfDict.get(PDFName.of("StdCF"));
    if (stdCFRef) {
      const stdCF = doc.context.lookup(stdCFRef, PDFDict);
      const cfmVal = stdCF && stdCF.get(PDFName.of("CFM"));
      if (cfmVal) cfm = cfmVal.toString();
    }
  }

  const candidates = [""];
  if (options.password) candidates.push(options.password);

  let fileKey = null;
  let mode = null;

  if (R === 6) {
    mode = "AESV3";
    for (const pw of candidates) {
      const pwBytes = encodePasswordAES256(pw);
      fileKey = await fileKeyR6(pwBytes, U, UE, O, OE);
      if (fileKey) break;
    }
  } else {
    mode = cfm === "/AESV2" ? "AESV2" : "RC4";
    const keyLength = dictNumber(enc, "Length")
      ? Math.ceil(dictNumber(enc, "Length") / 8)
      : V === 1
        ? 5
        : 16;
    for (const pw of candidates) {
      const pwBytes = encodePasswordLegacy(pw);
      if (
        validateLegacyUserKey(pwBytes, O, permissions, fileId, keyLength, U, R)
      ) {
        fileKey = fileKeyLegacy(pwBytes, O, permissions, fileId, keyLength);
        break;
      }
    }
  }

  if (!fileKey) throw new PasswordRequiredError();

  const decryptBuffer = async (data, objectNum, genNum) => {
    if (mode === "AESV3") {
      const iv = data.slice(0, 16);
      return aesCbcDecrypt(data.slice(16), fileKey, iv);
    }
    if (mode === "AESV2") {
      const key = objectKeyLegacy(fileKey, objectNum, genNum);
      const iv = data.slice(0, 16);
      return aesCbcDecrypt(data.slice(16), key, iv);
    }
    const key = objectKeyLegacy(fileKey, objectNum, genNum);
    return new Uint8Array(new RC4(key).process(data));
  };

  const decryptStrings = async (obj, objectNum, genNum, seen) => {
    if (!obj || seen.has(obj)) return;
    if (obj instanceof PDFString) {
      seen.add(obj);
      obj.value = bytesToPDFStringValue(
        await decryptBuffer(obj.asBytes(), objectNum, genNum),
      );
    } else if (obj instanceof PDFHexString) {
      seen.add(obj);
      obj.value = bytesToHex(
        await decryptBuffer(obj.asBytes(), objectNum, genNum),
      );
    } else if (obj instanceof PDFDict) {
      seen.add(obj);
      const isSigDict =
        obj.has(PDFName.of("ByteRange")) && obj.has(PDFName.of("Contents"));
      for (const [key, value] of obj.entries()) {
        if (
          key.asString() === "/Length" ||
          key.asString() === "/Filter" ||
          key.asString() === "/DecodeParms"
        )
          continue;
        if (isSigDict && key.asString() === "/Contents") continue;
        await decryptStrings(value, objectNum, genNum, seen);
      }
    } else if (obj instanceof PDFArray) {
      seen.add(obj);
      for (const el of obj.asArray())
        await decryptStrings(el, objectNum, genNum, seen);
    }
  };

  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    const objectNum = ref.objectNumber;
    const genNum = ref.generationNumber || 0;

    if (obj === enc) continue;

    if (obj instanceof PDFRawStream) {
      const type = obj.dict && obj.dict.get(PDFName.of("Type"));
      if (type && (type.toString() === "/XRef" || type.toString() === "/Sig"))
        continue;
      obj.contents = new Uint8Array(
        await decryptBuffer(obj.contents, objectNum, genNum),
      );
      if (obj.dict)
        await decryptStrings(obj.dict, objectNum, genNum, new WeakSet());
    } else if (obj instanceof PDFDict) {
      const f = obj.get(PDFName.of("Filter"));
      if (f && f.toString() === "/Standard") continue;
      await decryptStrings(obj, objectNum, genNum, new WeakSet());
    } else {
      await decryptStrings(obj, objectNum, genNum, new WeakSet());
    }
  }

  trailer.Encrypt = undefined;
  return doc.save({ useObjectStreams: false, updateFieldAppearances: false });
}
