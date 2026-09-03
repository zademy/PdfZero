import { describe, it, expect } from "vitest";
import {
  createMemoryOcrDocumentStore,
  newestFirst,
} from "./ocrDocumentStore.js";

function makeDoc(overrides = {}) {
  return {
    id: "doc-1",
    title: "Invoice Report",
    markdown: "## Page 1\n\ncontent",
    meta: {
      sourceName: "invoice",
      pages: 1,
      engine: "glm-ocr:latest",
      createdAt: 1756800000000,
      partialFormat: false,
    },
    ...overrides,
  };
}

describe("createMemoryOcrDocumentStore", () => {
  it("saves and gets a document back with metadata intact", async () => {
    const store = createMemoryOcrDocumentStore();
    const doc = makeDoc();
    await store.save(doc);
    const loaded = await store.get("doc-1");
    expect(loaded).toEqual(doc);
  });

  it("lists newest first by meta.createdAt", async () => {
    const store = createMemoryOcrDocumentStore();
    await store.save(
      makeDoc({ id: "old", meta: { ...makeDoc().meta, createdAt: 100 } }),
    );
    await store.save(
      makeDoc({ id: "new", meta: { ...makeDoc().meta, createdAt: 300 } }),
    );
    await store.save(
      makeDoc({ id: "mid", meta: { ...makeDoc().meta, createdAt: 200 } }),
    );
    const list = await store.list();
    expect(list.map((d) => d.id)).toEqual(["new", "mid", "old"]);
  });

  it("update via save preserves the id and persists edits", async () => {
    const store = createMemoryOcrDocumentStore();
    await store.save(makeDoc());
    await store.save(makeDoc({ title: "Renamed", markdown: "## edited" }));
    const loaded = await store.get("doc-1");
    expect(loaded.title).toBe("Renamed");
    expect(loaded.markdown).toBe("## edited");
    expect((await store.list()).length).toBe(1);
  });

  it("delete removes only the targeted document", async () => {
    const store = createMemoryOcrDocumentStore();
    await store.save(makeDoc({ id: "a" }));
    await store.save(makeDoc({ id: "b" }));
    await store.remove("a");
    const list = await store.list();
    expect(list.map((d) => d.id)).toEqual(["b"]);
    expect(await store.get("a")).toBeUndefined();
  });

  it("get on a missing id resolves undefined, not a rejection", async () => {
    const store = createMemoryOcrDocumentStore();
    await expect(store.get("nope")).resolves.toBeUndefined();
  });

  it("seeds from an initial array (same order rules apply)", async () => {
    const a = makeDoc({ id: "a", meta: { ...makeDoc().meta, createdAt: 1 } });
    const b = makeDoc({ id: "b", meta: { ...makeDoc().meta, createdAt: 2 } });
    const store = createMemoryOcrDocumentStore([a, b]);
    expect((await store.list()).map((d) => d.id)).toEqual(["b", "a"]);
  });
});

describe("newestFirst", () => {
  it("is a stable descending sort by createdAt", () => {
    const docs = [
      { id: "1", meta: { createdAt: 5 } },
      { id: "2", meta: { createdAt: 9 } },
      { id: "3", meta: { createdAt: 7 } },
    ];
    expect(newestFirst(docs).map((d) => d.id)).toEqual(["2", "3", "1"]);
    // input not mutated
    expect(docs[0].id).toBe("1");
  });
});
