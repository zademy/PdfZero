// OCR document persistence (spec #6, ticket #9) — IndexedDB behind a small
// seam with an injectable backing store, no new dependencies.
//
// One OCR document (glossary term, CONTEXT.md):
//   { id, title, markdown, meta: { sourceName, pages, engine,
//     createdAt, partialFormat } }
//
// The store interface is four async methods — list/get/save/remove — so the
// workspace never touches IndexedDB directly and tests run against
// createMemoryOcrDocumentStore() without any database. `save` is an upsert
// keyed by id: creation and autosave updates go through the same path.
// list() always returns documents newest-first (meta.createdAt descending).

const DB_NAME = "pdfzero-ocr";
const DB_VERSION = 1;
const OBJECT_STORE = "documents";

/** Descending by meta.createdAt; does not mutate the input. */
export function newestFirst(docs) {
  return [...docs].sort(
    (a, b) => (b.meta?.createdAt ?? 0) - (a.meta?.createdAt ?? 0),
  );
}

/** In-memory store with the same interface as the IndexedDB one. */
export function createMemoryOcrDocumentStore(seed = []) {
  const records = new Map(seed.map((doc) => [doc.id, { ...doc }]));
  return {
    async list() {
      return newestFirst([...records.values()].map((d) => ({ ...d })));
    },
    async get(id) {
      const doc = records.get(id);
      return doc ? { ...doc } : undefined;
    },
    async save(doc) {
      records.set(doc.id, { ...doc });
    },
    async remove(id) {
      records.delete(id);
    },
  };
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function createIdbStore(db) {
  const tx = (mode, fn) => {
    const store = db.transaction(OBJECT_STORE, mode).objectStore(OBJECT_STORE);
    return fn(store);
  };
  return {
    async list() {
      const all = await tx("readonly", (s) => requestToPromise(s.getAll()));
      return newestFirst(all);
    },
    async get(id) {
      return tx("readonly", (s) => requestToPromise(s.get(id)));
    },
    async save(doc) {
      await tx("readwrite", (s) => requestToPromise(s.put(doc)));
    },
    async remove(id) {
      await tx("readwrite", (s) => requestToPromise(s.delete(id)));
    },
  };
}

/**
 * Opens (or creates) the pdfzero-ocr IndexedDB and returns the store.
 * Rejects when IndexedDB is unavailable — callers decide how to surface it.
 */
export function openOcrDocumentStore() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(OBJECT_STORE)) {
        req.result.createObjectStore(OBJECT_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(createIdbStore(req.result));
    req.onerror = () => reject(req.error ?? new Error("IndexedDB unavailable"));
  });
}
