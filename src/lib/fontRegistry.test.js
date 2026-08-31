import { describe, expect, it } from "vitest";
import {
  CUSTOM_PATTERNS,
  FAMILIES,
  FAMILY_VALUES,
  familyCss,
  getFamily,
  isCustomFamily,
} from "./fontRegistry.js";

describe("fontRegistry", () => {
  it("offers unique values and labels", () => {
    const values = FAMILIES.map((f) => f.value);
    const labels = FAMILIES.map((f) => f.label);
    expect(new Set(values).size).toBe(values.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("keeps the three base-14 families as standard", () => {
    for (const v of ["Helvetica", "Times-Roman", "Courier"]) {
      expect(FAMILY_VALUES.has(v)).toBe(true);
      expect(isCustomFamily(v)).toBe(false);
    }
  });

  it("ships four multilingual custom families with css stacks", () => {
    for (const v of ["NotoSans", "NotoSerif", "Lato", "Merriweather"]) {
      const fam = getFamily(v);
      expect(fam).toBeTruthy();
      expect(fam.custom).toBe(true);
      expect(isCustomFamily(v)).toBe(true);
      expect(fam.css.length).toBeGreaterThan(0);
    }
  });

  it("detects custom families from embedded-style names", () => {
    expect(
      CUSTOM_PATTERNS.find((p) => p.re.test("BCDFEE+Lato-Bold"))?.value,
    ).toBe("Lato");
    expect(
      CUSTOM_PATTERNS.find((p) => p.re.test("Merriweather-Italic"))?.value,
    ).toBe("Merriweather");
    expect(
      CUSTOM_PATTERNS.find((p) => p.re.test("NotoSans-Regular"))?.value,
    ).toBe("NotoSans");
    expect(CUSTOM_PATTERNS.find((p) => p.re.test("NotoSerifBold"))?.value).toBe(
      "NotoSerif",
    );
  });

  it("does not false-match custom families on unrelated names", () => {
    for (const p of CUSTOM_PATTERNS) {
      expect(p.re.test("ArialMT")).toBe(false);
      expect(p.re.test("TimesNewRomanPS-BoldMT")).toBe(false);
      expect(p.re.test("Helvetica-Bold")).toBe(false);
    }
  });

  it("falls back to a css stack for unknown values", () => {
    expect(familyCss("NoSuchFont")).toBe(FAMILIES[0].css);
    expect(familyCss("Lato")).toBe(getFamily("Lato").css);
  });
});
