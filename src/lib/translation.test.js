import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { translateText, GLM_API_URL, GLM_MODEL } from "./translation.js";

const okResponse = (text) => ({
  ok: true,
  status: 200,
  json: async () => ({ choices: [{ message: { content: text } }] }),
});

let fetchMock;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("VITE_GLM_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("translateText — request shape", () => {
  it("posts to the GLM coding-plan endpoint with the settled params", async () => {
    fetchMock.mockResolvedValueOnce(okResponse("Hola"));

    const result = await translateText("Hello");

    expect(result).toEqual({ ok: true, translated: "Hola" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(GLM_API_URL);
    expect(url).toBe("https://api.z.ai/api/coding/paas/v4/chat/completions");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer test-key",
    });
    const body = JSON.parse(init.body);
    expect(body.model).toBe(GLM_MODEL);
    expect(body.model).toBe("glm-5.2");
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(body.stream).toBe(false);
    expect(body.temperature).toBe(0.2);
  });

  it("uses a system prompt with auto-direction EN↔ES, translation-only output and line-break preservation", async () => {
    fetchMock.mockResolvedValueOnce(okResponse("ok"));

    await translateText("Hello");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages).toHaveLength(2);
    const [system, user] = body.messages;
    expect(system.role).toBe("system");
    expect(system.content).toMatch(/english/i);
    expect(system.content).toMatch(/spanish/i);
    expect(system.content).toMatch(/only/i);
    expect(system.content).toMatch(/line break/i);
    expect(user.role).toBe("user");
    expect(user.content).toBe("Hello");
  });

  it("passes multi-line text through as the user message", async () => {
    fetchMock.mockResolvedValueOnce(okResponse("uno\ndos"));
    const input = "one\ntwo";

    const result = await translateText(input);

    expect(result.translated).toBe("uno\ndos");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages[1].content).toBe("one\ntwo");
  });
});

describe("translateText — directions", () => {
  it("returns the Spanish translation for English input", async () => {
    fetchMock.mockResolvedValueOnce(okResponse("Hola, ¿cómo estás?"));

    const result = await translateText("Hello, how are you?");

    expect(result).toEqual({ ok: true, translated: "Hola, ¿cómo estás?" });
  });

  it("returns the English translation for Spanish input", async () => {
    fetchMock.mockResolvedValueOnce(okResponse("Good morning"));

    const result = await translateText("Buenos días");

    expect(result).toEqual({ ok: true, translated: "Good morning" });
  });
});

describe("translateText — echo retry", () => {
  it("retries once with the explicit prompt when the model echoes the input", async () => {
    fetchMock.mockResolvedValueOnce(okResponse("The cat is sleeping"));
    fetchMock.mockResolvedValueOnce(okResponse("El gato está durmiendo"));

    const result = await translateText("The cat is sleeping");

    expect(result).toEqual({ ok: true, translated: "El gato está durmiendo" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(retryBody.messages[0].content).toMatch(/other language/i);
    expect(retryBody.messages[1].content).toBe("The cat is sleeping");
  });

  it("returns the echo as-is when the retry also echoes", async () => {
    fetchMock.mockResolvedValueOnce(okResponse("Hola"));
    fetchMock.mockResolvedValueOnce(okResponse("Hola"));

    const result = await translateText("Hola");

    expect(result).toEqual({ ok: true, translated: "Hola" });
  });

  it("does not retry when the first response differs from the input", async () => {
    fetchMock.mockResolvedValueOnce(okResponse("El gato está durmiendo"));

    await translateText("The cat is sleeping");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("translateText — error outcomes", () => {
  it("returns EMPTY_TEXT and makes no request for blank input", async () => {
    const result = await translateText("   \n\t ");

    expect(result.ok).toBe(false);
    expect(result.code).toBe("EMPTY_TEXT");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns MISSING_KEY (no generic throw) and makes no request when the env var is absent", async () => {
    vi.stubEnv("VITE_GLM_API_KEY", "");

    const result = await translateText("Hello");

    expect(result.ok).toBe(false);
    expect(result.code).toBe("MISSING_KEY");
    expect(result.message).toMatch(/VITE_GLM_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns NETWORK when fetch rejects", async () => {
    fetchMock.mockRejectedValueOnce(new Error("boom"));

    const result = await translateText("Hello");

    expect(result).toMatchObject({ ok: false, code: "NETWORK" });
  });

  it("returns API_ERROR with the HTTP status on a non-2xx response", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({}),
    });

    const result = await translateText("Hello");

    expect(result.ok).toBe(false);
    expect(result.code).toBe("API_ERROR");
    expect(result.message).toMatch(/429/);
  });

  it("returns BAD_RESPONSE when the body is not JSON", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("bad json");
      },
    });

    const result = await translateText("Hello");

    expect(result).toMatchObject({ ok: false, code: "BAD_RESPONSE" });
  });

  it("returns BAD_RESPONSE when the payload has no translatable content", async () => {
    fetchMock.mockResolvedValueOnce(okResponse(""));

    const result = await translateText("Hello");

    expect(result).toMatchObject({ ok: false, code: "BAD_RESPONSE" });
  });
});
