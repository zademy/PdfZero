// Single source of truth for font families offered by the editors' pickers
// and honored by the vector exporter.
//
// - Standard families (std: true) map to PDF base-14 fonts: always embeddable
//   by pdf-lib, WinAnsi encoding (covers es/en Latin).
// - Custom families carry fontkit-embeddable TTFs (see fontFiles.js) with
//   broad multilingual coverage (Latin + Latin-Ext, the es/en set and beyond).
//   They are also loaded for screen preview via index.html (Google Fonts), so
//   on-canvas measurement (measureText) matches the embedded glyphs.
//
// classifyFont() canonicalizes arbitrary embedded PDF font names onto these
// values; the toolbar/properties pickers render exactly this list.

export const FAMILIES = [
  {
    value: "Helvetica",
    label: "Helvetica",
    css: 'Helvetica, Arial, "Noto Sans", sans-serif',
    std: true,
  },
  {
    value: "Times-Roman",
    label: "Times",
    css: '"Times New Roman", "Noto Serif", Times, serif',
    std: true,
  },
  {
    value: "Courier",
    label: "Courier",
    css: '"Courier New", Courier, monospace',
    std: true,
  },
  {
    value: "NotoSans",
    label: "Noto Sans",
    css: '"Noto Sans", Arial, sans-serif',
    custom: true,
  },
  {
    value: "NotoSerif",
    label: "Noto Serif",
    css: '"Noto Serif", Georgia, serif',
    custom: true,
  },
  {
    value: "Lato",
    label: "Lato",
    css: 'Lato, "Noto Sans", Arial, sans-serif',
    custom: true,
  },
  {
    value: "Merriweather",
    label: "Merriweather",
    css: 'Merriweather, "Noto Serif", Georgia, serif',
    custom: true,
  },
];

export const FAMILY_VALUES = new Set(FAMILIES.map((f) => f.value));

// Raw-name patterns that classifyFont uses to detect each custom family.
// Checked before the generic sans/serif buckets so real matches win.
export const CUSTOM_PATTERNS = [
  { value: "NotoSans", re: /notosans/i },
  { value: "NotoSerif", re: /notoserif/i },
  { value: "Lato", re: /(^|[^a-z])lato($|[^a-z])/i },
  { value: "Merriweather", re: /merriweather/i },
];

export function isCustomFamily(value) {
  return FAMILIES.some((f) => f.value === value && f.custom);
}

export function getFamily(value) {
  return FAMILIES.find((f) => f.value === value) || null;
}

export function familyCss(value) {
  return getFamily(value)?.css || FAMILIES[0].css;
}

// ─── Font classification ───────────────────────────────────────────────────
// Maps any font name (real or internal) to: CSS stack, pdf-lib family, bold, italic
export function classifyFont(rawName) {
  if (!rawName) return _fallback();
  if (/^g_d\d+_f\d+$/.test(rawName)) return _fallback();

  // Strip common prefixes/suffixes that don't affect font family
  const n = rawName
    .replace(/^[A-Z]{6}\+/, "") // BCDFEE+Arial → Arial
    .replace(/PSMT$/i, "") // TimesNewRomanPSMT → TimesNewRoman
    .replace(/PS$/i, "") // TimesNewRomanPS → TimesNewRoman
    .replace(/MT$/i, "") // ArialMT → Arial, TimesNewRomanPS-BoldMT → TimesNewRomanPS-Bold
    .replace(/Std$/i, "")
    .replace(/Pro$/i, "")
    .replace(/Linotype$/i, "")
    .replace(/LT$/i, "");

  // Detect bold/italic from name
  const bold = /bold|heavy|black|semibold|demi|extrab/i.test(n);
  const italic = /italic|oblique|(-it)($|[^a-z])/i.test(n);

  // ── 0. Embeddable substitute families (fontRegistry.js) ──────────────────
  // These have real TTFs in-repo (fontFiles.js), so a detected match keeps
  // its true family through screen rendering AND vector export instead of
  // collapsing into the generic sans/serif buckets below.
  for (const { value, re } of CUSTOM_PATTERNS) {
    if (re.test(n)) {
      return { family: value, bold, italic, css: familyCss(value) };
    }
  }
  // Exact family value passthrough (blocks already carrying a picker choice)
  if (FAMILY_VALUES.has(rawName)) {
    return { family: rawName, bold, italic, css: familyCss(rawName) };
  }

  // ── 1. Times New Roman and Roman/Serif families ──────────────────────────
  // Must come before Arial check since "TimesNewRomanPS-BoldMT" is the real
  // name returned by commonObjs.name for the heading font in the NSS PDF.
  if (
    /times|roman(?!ia)|timesnew|garamond|palatino|cambria|caslon|baskerville|bookman|charter|minion|constantia|utopia|warnock|didot/i.test(
      n,
    )
  ) {
    let css = '"Times New Roman", "Noto Serif", Times, serif';
    if (/georgia/i.test(n)) css = 'Georgia, "Noto Serif", serif';
    if (/garamond/i.test(n)) css = '"EB Garamond", "Noto Serif", serif';
    if (/palatino/i.test(n)) css = '"Palatino Linotype", "Noto Serif", serif';
    if (/cambria/i.test(n)) css = 'Cambria, "Noto Serif", serif';
    return { family: "Times-Roman", bold, italic, css };
  }
  if (/georgia/i.test(n)) {
    return {
      family: "Times-Roman",
      bold,
      italic,
      css: 'Georgia, "Noto Serif", serif',
    };
  }

  // ── 2. Courier / Monospace ────────────────────────────────────────────────
  if (
    /courier|cour(?=\b)|mono(?!tone)|typewriter|consolas|inconsolata|sourcecodesans|lucidaconsole|andale/i.test(
      n,
    )
  ) {
    return {
      family: "Courier",
      bold,
      italic,
      css: '"Courier New", Courier, monospace',
    };
  }

  // ── 3. Arial — must be explicit before the broad sans-serif catch ─────────
  if (/^arial/i.test(n)) {
    return {
      family: "Helvetica",
      bold,
      italic,
      css: 'Arial, "Noto Sans", Helvetica, sans-serif',
    };
  }

  // ── 4. Helvetica ──────────────────────────────────────────────────────────
  if (/^helvetica/i.test(n)) {
    return {
      family: "Helvetica",
      bold,
      italic,
      css: "Helvetica, Arial, sans-serif",
    };
  }

  // ── 5. Comic Sans ─────────────────────────────────────────────────────────
  if (/comic/i.test(n)) {
    return {
      family: "Helvetica",
      bold,
      italic,
      css: '"Comic Sans MS", cursive, sans-serif',
    };
  }

  // ── 6. Impact / condensed display ─────────────────────────────────────────
  if (/^impact/i.test(n) || /arialnarrow/i.test(n)) {
    return {
      family: "Helvetica",
      bold: true,
      italic,
      css: 'Impact, "Arial Narrow", sans-serif',
    };
  }

  // ── 7. Geometric / Humanist sans ─────────────────────────────────────────
  if (
    /futura|avenir|gillsans|centurygothic|optima|myriad|frutiger|univers/i.test(
      n,
    )
  ) {
    return {
      family: "Helvetica",
      bold,
      italic,
      css: '"Century Gothic", Arial, sans-serif',
    };
  }

  // ── 8. Calibri / Candara / Corbel ─────────────────────────────────────────
  if (/calibri/i.test(n))
    return {
      family: "Helvetica",
      bold,
      italic,
      css: "Calibri, Arial, sans-serif",
    };
  if (/candara/i.test(n))
    return {
      family: "Helvetica",
      bold,
      italic,
      css: "Candara, Arial, sans-serif",
    };

  // ── 9. Verdana / Tahoma / Trebuchet ───────────────────────────────────────
  if (/verdana/i.test(n))
    return {
      family: "Helvetica",
      bold,
      italic,
      css: "Verdana, Arial, sans-serif",
    };
  if (/tahoma/i.test(n))
    return {
      family: "Helvetica",
      bold,
      italic,
      css: "Tahoma, Arial, sans-serif",
    };
  if (/trebuchet/i.test(n))
    return {
      family: "Helvetica",
      bold,
      italic,
      css: '"Trebuchet MS", Arial, sans-serif',
    };

  // ── 10. Common sans-serif web fonts ───────────────────────────────────────
  if (
    /roboto|opensans|lato|montserrat|raleway|nunito|sourcesans|notosans|inter(?=\b|-)|ubuntu(?=\b)|franklin|gothic/i.test(
      n,
    )
  ) {
    return {
      family: "Helvetica",
      bold,
      italic,
      css: 'Arial, "Noto Sans", Helvetica, sans-serif',
    };
  }

  // ── 11. Noto family ───────────────────────────────────────────────────────
  if (/notoserif/i.test(n))
    return {
      family: "Times-Roman",
      bold,
      italic,
      css: '"Noto Serif", Georgia, serif',
    };
  if (/notosans/i.test(n))
    return {
      family: "Helvetica",
      bold,
      italic,
      css: '"Noto Sans", Arial, sans-serif',
    };

  // ── 12. Generic fallback by keyword ───────────────────────────────────────
  if (/sans/i.test(n))
    return {
      family: "Helvetica",
      bold,
      italic,
      css: 'Arial, "Noto Sans", Helvetica, sans-serif',
    };
  if (/serif/i.test(n))
    return {
      family: "Times-Roman",
      bold,
      italic,
      css: '"Times New Roman", "Noto Serif", serif',
    };
  if (/mono/i.test(n))
    return { family: "Courier", bold, italic, css: '"Courier New", monospace' };

  // ── 13. Complete unknown ──────────────────────────────────────────────────
  return {
    family: "Helvetica",
    bold,
    italic,
    css: 'Arial, "Noto Sans", Helvetica, sans-serif',
  };
}

function _fallback() {
  return {
    family: "Helvetica",
    bold: false,
    italic: false,
    css: "Arial, Helvetica, sans-serif",
  };
}

// Canonical picker value for any block: classify through the registry so the
// dropdown always mirrors what export will honor — fontName if it already
// names a registry family, else classified from whatever font reference the
// block carries. Replaces the per-caller ad-hoc derivations (toolbar's fuzzy
// contains-match, panel's bare classifyFont(fontName)).
export function canonicalFamily(block) {
  return classifyFont(block?.fontName || block?.fontFamily || "").family;
}
