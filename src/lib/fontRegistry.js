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
