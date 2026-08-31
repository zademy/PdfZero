// Pure GLM translation client — the single seam for the EN↔ES translate feature.
// No React, no DOM: request shaping, response parsing and error mapping live here
// so the UI stays thin glue. Errors come back as result objects, never throws.
//
// Requires VITE_GLM_API_KEY in .env.local (see .env.example).

export const GLM_API_URL =
  "https://api.z.ai/api/coding/paas/v4/chat/completions";
export const GLM_MODEL = "glm-5.2";

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
      body: JSON.stringify({
        model: GLM_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: raw },
        ],
        thinking: { type: "disabled" },
        temperature: 0.2,
        stream: false,
      }),
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
