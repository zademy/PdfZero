// Pure GLM translation client — the single seam for the EN↔ES translate feature.
// No React, no DOM: request shaping, response parsing and error mapping live here
// so the UI stays thin glue. Errors come back as result objects, never throws.
//
// Requires VITE_GLM_API_KEY in .env.local (see .env.example).

export const GLM_API_URL =
  "https://api.z.ai/api/coding/paas/v4/chat/completions";
export const GLM_MODEL = "glm-5.3-flash";

// GLM-5.3-Flash recommended request settings
// (https://docs.z.ai/guides/vlm/glm-5.3-flash): temperature 1, top_p 0.95.
// thinking.type ONLY supports "enabled" — this model forces thinking — with
// thinking.clear_thinking kept false per the model page. reasoning_effort is
// set to "low" (valid values: max/high/low): translation is a lightweight
// task and "max" makes non-streaming page batches pend for minutes.
const chatBody = (messages, maxTokens) => ({
  model: GLM_MODEL,
  messages,
  thinking: { type: "enabled", clear_thinking: false },
  reasoning_effort: "low",
  temperature: 1,
  top_p: 0.95,
  stream: false,
  ...(maxTokens ? { max_tokens: maxTokens } : {}),
});

const SYSTEM_PROMPT = [
  "You are a precise translator.",
  "Detect whether the input text is English or Spanish.",
  "If it is English, translate it into Spanish; if it is Spanish, translate it into English.",
  "Return ONLY the translation — no commentary, no quotes, no explanations.",
  "Preserve the line breaks and whitespace structure of the input exactly.",
].join(" ");

const EXPLICIT_PROMPT = [
  "You are a precise translator.",
  "Translate the user text below into the OTHER language: English into Spanish, or Spanish into English.",
  "The output MUST be in the other language — never repeat the input unchanged.",
  "Return ONLY the translation — no commentary, no quotes, no explanations.",
  "Preserve the line breaks and whitespace structure of the input exactly.",
].join(" ");

const PAGE_SYSTEM_PROMPT = [
  "You are a precise professional translator.",
  "The user message is a JSON array of text segments from ONE document page, in reading order.",
  "Translate every segment: English into Spanish, or Spanish into English, so the whole page reads as one coherent document.",
  "SPANISH TARGET VARIETY: natural Latin American Spanish (es-419).",
  "Use 'ustedes' (never 'vosotros'), 'computadora' (not 'ordenador'), 'carro/auto' (not 'coche'), and Latin American professional vocabulary throughout.",
  "Keep terminology and proper nouns consistent across all segments.",
  "Each segment has a 'budget' (max characters). Your translation for that id MUST NOT exceed its budget — compress politely (drop filler, never meaning) if needed.",
  "CRITICAL: each output must contain ONLY its own segment's content. Never merge, split, or move content across segments — even when two segments form one visual line, heading, or sentence. Segment i's translation maps to segment i's box on the page.",
  "Preserve each segment's line breaks.",
  "Respond with ONLY a JSON object mapping every id to its translation.",
  "No markdown fences, no commentary, no explanations.",
].join(" ");

const PAGE_MAX_TOKENS = 16384;

const CONDENSE_SYSTEM_PROMPT = [
  "You compress translations so they fit inside character budgets.",
  "The user message is a JSON array of objects: {id, text, budget}.",
  "For every id, return a version of `text` whose length is AT MOST its budget characters.",
  "Preserve the meaning and the language; drop filler words, abbreviate politely, never cut mid-word.",
  "If the text already fits, return it unchanged.",
  "Respond with ONLY a JSON object mapping every id to the compressed text.",
  "No markdown fences, no commentary.",
].join(" ");

const EXPAND_SYSTEM_PROMPT = [
  "You refine short translations so they fill their space naturally.",
  "The user message is a JSON array of objects: {id, text, budget}.",
  "For every id, return a version of `text` in the SAME language whose length is approximately its budget characters (±10%).",
  "Stay faithful to the meaning: restore words the compression dropped, use fuller natural phrasing — never invent new facts, never pad with repetitions, filler or ellipses.",
  "The text is Latin American Spanish (es-419): keep it that way ('ustedes', 'computadora', 'carro').",
  "Return ONLY complete words; never cut mid-word.",
  "Respond with ONLY a JSON object mapping every id to the expanded text.",
  "No markdown fences, no commentary.",
].join(" ");

// Shorten translations that exceed their character budgets. One request.
// items: [{ id, text, budget }] → { ok, translations: {id: text} } | { ok:false, ... }
export async function condenseTranslations(items) {
  const list = (items || []).filter(
    (e) => e && e.id && typeof e.text === "string",
  );
  if (!list.length) {
    return { ok: true, translations: {} };
  }

  const apiKey = getGlmApiKey();
  if (!apiKey) {
    return {
      ok: false,
      code: "MISSING_KEY",
      message: "Translation API key missing.",
    };
  }

  let response;
  try {
    response = await fetch(GLM_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(
        chatBody(
          [
            { role: "system", content: CONDENSE_SYSTEM_PROMPT },
            {
              role: "user",
              content: JSON.stringify(
                list.map(({ id, text, budget }) => ({ id, text, budget })),
              ),
            },
          ],
          PAGE_MAX_TOKENS,
        ),
      ),
    });
  } catch (_) {
    return {
      ok: false,
      code: "NETWORK",
      message: "Could not reach the translation service.",
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      code: "API_ERROR",
      message: `Translation service error (HTTP ${response.status}).`,
    };
  }

  let data;
  try {
    data = await response.json();
  } catch (_) {
    return {
      ok: false,
      code: "BAD_RESPONSE",
      message: "Unreadable response from the translation service.",
    };
  }

  const map = parseBatchMap(data?.choices?.[0]?.message?.content);
  if (!map) {
    return {
      ok: false,
      code: "BAD_RESPONSE",
      message: "Compression service returned malformed data.",
    };
  }

  const translations = {};
  for (const { id, text } of list) {
    const candidate = map[id];
    // Only accept candidates that are strings; prefer ones that actually fit
    if (typeof candidate === "string" && candidate.trim()) {
      translations[id] =
        candidate.trim().length <= text.length ? candidate.trim() : text;
    } else {
      translations[id] = text;
    }
  }
  return { ok: true, translations };
}

// Lengthen translations that fall short of their character targets so the
// line fills its box with NATURAL text — no font or spacing tricks. One
// request, same shape as condenseTranslations.
export async function expandTranslations(items) {
  const list = (items || []).filter(
    (e) => e && e.id && typeof e.text === "string",
  );
  if (!list.length) {
    return { ok: true, translations: {} };
  }

  const apiKey = getGlmApiKey();
  if (!apiKey) {
    return { ok: false, code: "MISSING_KEY", message: "API key missing." };
  }

  let response;
  try {
    response = await fetch(GLM_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(
        chatBody(
          [
            { role: "system", content: EXPAND_SYSTEM_PROMPT },
            {
              role: "user",
              content: JSON.stringify(
                list.map(({ id, text, budget }) => ({ id, text, budget })),
              ),
            },
          ],
          PAGE_MAX_TOKENS,
        ),
      ),
    });
  } catch (_) {
    return {
      ok: false,
      code: "NETWORK",
      message: "Could not reach the translation service.",
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      code: "API_ERROR",
      message: `Translation service error (HTTP ${response.status}).`,
    };
  }

  let data;
  try {
    data = await response.json();
  } catch (_) {
    return {
      ok: false,
      code: "BAD_RESPONSE",
      message: "Unreadable response from the translation service.",
    };
  }

  const map = parseBatchMap(data?.choices?.[0]?.message?.content);
  if (!map) {
    return {
      ok: false,
      code: "BAD_RESPONSE",
      message: "Expansion service returned malformed data.",
    };
  }

  const translations = {};
  for (const { id } of list) {
    const candidate = map[id];
    if (typeof candidate === "string" && candidate.trim()) {
      translations[id] = candidate.trim();
    }
  }
  return { ok: true, translations };
}

export function getGlmApiKey() {
  return import.meta.env?.VITE_GLM_API_KEY || "";
}

// Result: { ok: true, translated } | { ok: false, code, message }
// Codes: EMPTY_TEXT | MISSING_KEY | NETWORK | API_ERROR | BAD_RESPONSE
async function requestTranslation(raw, apiKey, systemPrompt) {
  let response;
  try {
    response = await fetch(GLM_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(
        chatBody([
          { role: "system", content: systemPrompt },
          { role: "user", content: raw },
        ]),
      ),
    });
  } catch (_) {
    return {
      ok: false,
      code: "NETWORK",
      message:
        "Could not reach the translation service. Check your connection.",
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      code: "API_ERROR",
      message: `Translation service error (HTTP ${response.status}).`,
    };
  }

  let data;
  try {
    data = await response.json();
  } catch (_) {
    return {
      ok: false,
      code: "BAD_RESPONSE",
      message: "Unreadable response from the translation service.",
    };
  }

  const translated = data?.choices?.[0]?.message?.content;
  if (typeof translated !== "string" || !translated.trim()) {
    return {
      ok: false,
      code: "BAD_RESPONSE",
      message: "Translation service returned no text.",
    };
  }

  return { ok: true, translated: translated.trim() };
}

/**
 * Generic single-turn GLM chat shared by non-translation features (e.g. the
 * OCR markdown formatter). Resolves the key itself.
 * @returns {Promise<{ok: true, text: string} | {ok: false, code: string, message: string}>}
 */
export async function glmChat(userText, systemPrompt) {
  const raw = String(userText ?? "");
  if (!raw.trim()) {
    return { ok: false, code: "EMPTY_TEXT", message: "Nothing to send." };
  }
  const apiKey = getGlmApiKey();
  if (!apiKey) {
    return {
      ok: false,
      code: "MISSING_KEY",
      message: "No API key configured.",
    };
  }
  const res = await requestTranslation(raw, apiKey, systemPrompt);
  return res.ok ? { ok: true, text: res.translated } : res;
}

export async function translateText(text) {
  const raw = String(text ?? "");
  if (!raw.trim()) {
    return { ok: false, code: "EMPTY_TEXT", message: "Nothing to translate." };
  }

  const apiKey = getGlmApiKey();
  if (!apiKey) {
    return {
      ok: false,
      code: "MISSING_KEY",
      message:
        "Translation API key missing. Set VITE_GLM_API_KEY in .env.local and restart the dev server.",
    };
  }

  let result = await requestTranslation(raw, apiKey, SYSTEM_PROMPT);

  // The endpoint occasionally echoes the input back unchanged — retry once
  // with the explicit never-repeat prompt before accepting it.
  if (result.ok && result.translated === raw.trim()) {
    result = await requestTranslation(raw, apiKey, EXPLICIT_PROMPT);
  }

  return result;
}

// ── Page-level batch translation ─────────────────────────────────────────────
// Reading order: top-to-bottom, then left-to-right (PDF coordinate space where
// smaller y is higher on the page — blocks here carry pdfjs-style overlay x/y).

export function sortByReadingOrder(blocks) {
  return [...(blocks || [])].sort((a, b) => {
    const ay = a.y ?? 0;
    const by = b.y ?? 0;
    if (Math.abs(ay - by) > 4) return ay - by; // tolerance: same line
    return (a.x ?? 0) - (b.x ?? 0);
  });
}

function parseBatchMap(content) {
  if (typeof content !== "string") return null;
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch (_) {}
  return null;
}

// entries: [{ id, text, budget }] in reading order.
// Result:
//   { ok: true, translations: {id: str}, fallbackUsed: [id], failed: [id] }
//   { ok: false, code, message } — same error vocabulary as translateText.
export async function translatePage(entries) {
  const list = (entries || []).filter(
    (e) => e && e.id && String(e.text ?? "").trim(),
  );
  if (!list.length) {
    return {
      ok: false,
      code: "EMPTY_TEXT",
      message: "Nothing to translate on this page.",
    };
  }

  const apiKey = getGlmApiKey();
  if (!apiKey) {
    return {
      ok: false,
      code: "MISSING_KEY",
      message:
        "Translation API key missing. Set VITE_GLM_API_KEY in .env.local and restart the dev server.",
    };
  }

  const payload = list.map(({ id, text, budget }) => ({ id, text, budget }));

  let map;
  let response;
  try {
    response = await fetch(GLM_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(
        chatBody(
          [
            { role: "system", content: PAGE_SYSTEM_PROMPT },
            { role: "user", content: JSON.stringify(payload) },
          ],
          PAGE_MAX_TOKENS,
        ),
      ),
    });
  } catch (_) {
    return {
      ok: false,
      code: "NETWORK",
      message:
        "Could not reach the translation service. Check your connection.",
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      code: "API_ERROR",
      message: `Translation service error (HTTP ${response.status}).`,
    };
  }

  try {
    const data = await response.json();
    map = parseBatchMap(data?.choices?.[0]?.message?.content);
  } catch (_) {
    map = null;
  }

  const translations = {};
  const needsFallback = [];

  if (map) {
    for (const { id, text } of list) {
      const candidate = map[id];
      if (
        typeof candidate === "string" &&
        candidate.trim() &&
        candidate.trim() !== text.trim()
      ) {
        translations[id] = candidate.trim();
      } else {
        needsFallback.push(id);
      }
    }
  } else {
    needsFallback.push(...list.map((e) => e.id));
  }

  const fallbackUsed = [];
  const failed = [];
  for (const { id, text } of list) {
    if (!needsFallback.includes(id)) continue;
    const single = await translateText(text);
    if (single.ok) {
      translations[id] = single.translated;
      fallbackUsed.push(id);
    } else {
      failed.push(id);
    }
  }

  return { ok: true, translations, fallbackUsed, failed };
}
