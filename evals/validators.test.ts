import { describe, it, expect } from 'vitest';
import { parseABV, compareABV, compareNetContents, compareGovernmentWarning, GOVERNMENT_WARNING_OFFICIAL } from '@/lib/validators/regex';
import { fuzzyEqual, compareTextField } from '@/lib/validators/semantic';
import { isApprovedClassType } from '@/lib/validators/spirits';

// ─── ABV ────────────────────────────────────────────────────────────────────

describe("parseABV", () => {
  it("parses standard format", () => {
    const r = parseABV("45% Alc./Vol.");
    expect(r?.numeric).toBe(45);
    expect(r?.valid).toBe(true);
  });

  it("parses lowercase variant", () => {
    const r = parseABV("40% alc. by vol.");
    expect(r?.numeric).toBe(40);
  });

  it("parses proof format", () => {
    const r = parseABV("90 Proof");
    expect(r?.numeric).toBe(45);
  });

  it("returns null for non-ABV string", () => {
    expect(parseABV("Kentucky Straight Bourbon")).toBeNull();
  });

  it("returns null for out-of-range ABV", () => {
    expect(parseABV("99.9% Alc./Vol.")).toBeNull();
  });

  it("parses ABV with space before %", () => {
    const r = parseABV("45 % Alc./Vol.");
    expect(r?.numeric).toBe(45);
  });
});

describe("compareABV", () => {
  it("matches identical ABV", () => {
    expect(compareABV("45% Alc./Vol.", "45% Alc./Vol.").match).toBe(true);
  });

  it("matches same numeric value with different formatting", () => {
    expect(compareABV("40% Alc./Vol.", "40% alc. by vol.").match).toBe(true);
  });

  it("matches proof to percent conversion", () => {
    expect(compareABV("45% Alc./Vol.", "90 Proof").match).toBe(true);
  });

  it("fails on different ABV", () => {
    const r = compareABV("45% Alc./Vol.", "40% Alc./Vol.");
    expect(r.match).toBe(false);
    expect(r.note).toMatch(/mismatch/);
  });

  it("fails when submitted ABV is not parseable", () => {
    const r = compareABV("not-a-number", "45% Alc./Vol.");
    expect(r.match).toBe(false);
  });
});

// ─── Net Contents ────────────────────────────────────────────────────────────

describe("compareNetContents", () => {
  it("matches identical net contents", () => {
    expect(compareNetContents("750 mL", "750 mL").match).toBe(true);
  });

  it("matches case-insensitive ml", () => {
    expect(compareNetContents("750 mL", "750 ml").match).toBe(true);
  });

  it("matches mL vs ml with no spacing", () => {
    expect(compareNetContents("750mL", "750 mL").match).toBe(true);
  });

  it("matches L vs mL conversion (1L = 1000mL)", () => {
    expect(compareNetContents("1 L", "1000 mL").match).toBe(true);
  });

  it("fails on different volume", () => {
    const r = compareNetContents("750 mL", "375 mL");
    expect(r.match).toBe(false);
  });
});

// ─── Government Warning ──────────────────────────────────────────────────────

describe("compareGovernmentWarning", () => {
  it("passes on exact official text", () => {
    const r = compareGovernmentWarning(GOVERNMENT_WARNING_OFFICIAL, GOVERNMENT_WARNING_OFFICIAL);
    expect(r.status).toBe("pass");
  });

  it("fails when label has no warning", () => {
    const r = compareGovernmentWarning(GOVERNMENT_WARNING_OFFICIAL, null);
    expect(r.status).toBe("fail");
    expect(r.note).toMatch(/not found/i);
  });

  it("fails when warning uses wrong capitalization (title case)", () => {
    const wrong = GOVERNMENT_WARNING_OFFICIAL.replace("GOVERNMENT WARNING:", "Government Warning:");
    const r = compareGovernmentWarning(GOVERNMENT_WARNING_OFFICIAL, wrong);
    expect(r.status).toBe("fail");
    expect(r.note).toMatch(/all capital/i);
  });

  it("warns when warning is present but truncated", () => {
    // Per BUG-08 / govwarn-100pct-threshold spec: any non-100% match routes to
    // human review, including obvious truncations. Bias toward flag, not pass.
    const partial = "GOVERNMENT WARNING: (1) According to the Surgeon General...";
    const r = compareGovernmentWarning(GOVERNMENT_WARNING_OFFICIAL, partial);
    expect(r.status).toBe("warning");
    expect(r.note).toMatch(/character/i);
  });

  it("warns when warning has line-break hyphen artifacts", () => {
    // Hyphen joining recovers "GENERAL" / "CONSUMPTION" but the official text
    // has "General" / "Consumption" (case differs). Strict equality after
    // normalization fails, so this surfaces as warning rather than pass.
    const withHyphens =
      "GOVERNMENT WARNING: (1) According to the Surgeon GEN- ERAL, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) CONSUMP- TION of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.";
    const r = compareGovernmentWarning(GOVERNMENT_WARNING_OFFICIAL, withHyphens);
    expect(r.status).toBe("warning");
  });

  it("fails when warning is completely absent", () => {
    const r = compareGovernmentWarning(GOVERNMENT_WARNING_OFFICIAL, "No warning here");
    expect(r.status).toBe("fail");
  });

  // ─── Sneaky one-word substitutions — BUG-08 cat-6 fixtures ─────────────────
  // The government warning has exact statutory wording; subtle substitutions
  // must not auto-pass. Each test below mirrors a real cat-6 fixture from
  // evals/fixtures/generated/06-warning-sneaky-{01,03,04,05}.json.

  it("warns when 'may cause' is substituted with 'could cause'", () => {
    const sneaky = GOVERNMENT_WARNING_OFFICIAL.replace("may cause", "could cause");
    const r = compareGovernmentWarning(GOVERNMENT_WARNING_OFFICIAL, sneaky);
    expect(r.status).toBe("warning");
  });

  it("warns when 'a Surgeon General' replaces 'the Surgeon General'", () => {
    const sneaky = GOVERNMENT_WARNING_OFFICIAL.replace("the Surgeon General", "a Surgeon General");
    const r = compareGovernmentWarning(GOVERNMENT_WARNING_OFFICIAL, sneaky);
    expect(r.status).toBe("warning");
  });

  it("warns when 'alcohol beverages' replaces 'alcoholic beverages' in the first sentence", () => {
    // Replace only the first occurrence so the second sentence still matches.
    const sneaky = GOVERNMENT_WARNING_OFFICIAL.replace("alcoholic beverages", "alcohol beverages");
    const r = compareGovernmentWarning(GOVERNMENT_WARNING_OFFICIAL, sneaky);
    expect(r.status).toBe("warning");
  });

  it("warns when colon is missing after GOVERNMENT WARNING", () => {
    // CAPS prefix is intact — should NOT hard-fail. Falls into equality check
    // and surfaces as warning so the agent can confirm wording integrity.
    const sneaky = GOVERNMENT_WARNING_OFFICIAL.replace("GOVERNMENT WARNING:", "GOVERNMENT WARNING");
    const r = compareGovernmentWarning(GOVERNMENT_WARNING_OFFICIAL, sneaky);
    expect(r.status).toBe("warning");
  });
});

// ─── Semantic / Fuzzy ────────────────────────────────────────────────────────

describe("fuzzyEqual", () => {
  it("matches identical strings", () => {
    expect(fuzzyEqual("Old Tom Distillery", "Old Tom Distillery")).toBe(true);
  });

  it("matches case-insensitive — STONES THROW vs Stones Throw", () => {
    expect(fuzzyEqual("STONES THROW", "Stones Throw")).toBe(true);
  });

  it("matches with extra whitespace", () => {
    expect(fuzzyEqual("Old Tom  Distillery", "Old Tom Distillery")).toBe(true);
  });

  it("does not match different strings", () => {
    expect(fuzzyEqual("Old Tom", "New Tom")).toBe(false);
  });
});

describe("compareTextField", () => {
  it("passes on exact match", () => {
    const r = compareTextField("Old Tom Distillery", "Old Tom Distillery", "Brand");
    expect(r.status).toBe("pass");
  });

  it("passes on case-insensitive match", () => {
    const r = compareTextField("OLD TOM DISTILLERY", "Old Tom Distillery", "Brand");
    expect(r.status).toBe("pass");
  });

  it("fails when extracted is null", () => {
    const r = compareTextField("Old Tom Distillery", null, "Brand");
    expect(r.status).toBe("fail");
  });

  it("passes or warns on near-match with minor typo", () => {
    const r = compareTextField("Old Tom Distilery", "Old Tom Distillery", "Brand");
    expect(["pass", "warning"]).toContain(r.status);
  });

  it("fails on very different strings", () => {
    const r = compareTextField("Old Tom Distillery", "Eagle Rare Bourbon", "Brand");
    expect(r.status).toBe("fail");
  });
});

// ─── Class/Type CFR Approval ─────────────────────────────────────────────────

describe("isApprovedClassType", () => {
  it("approves bourbon whiskey", () => {
    expect(isApprovedClassType("Kentucky Straight Bourbon Whiskey")).toBe(true);
  });

  it("approves vodka", () => {
    expect(isApprovedClassType("Vodka")).toBe(true);
  });

  it("approves rum", () => {
    expect(isApprovedClassType("Light Rum")).toBe(true);
  });

  it("approves gin", () => {
    expect(isApprovedClassType("London Dry Gin")).toBe(true);
  });

  it("does not approve invented designation", () => {
    expect(isApprovedClassType("Premium Ultra Reserve")).toBe(false);
  });

  it("approves tequila", () => {
    expect(isApprovedClassType("Blanco Tequila")).toBe(true);
  });

  // Flavored class — 27 CFR 5.22(i)
  it("approves Flavored Vodka", () => {
    expect(isApprovedClassType("Flavored Vodka")).toBe(true);
  });

  it("approves Flavored Gin", () => {
    expect(isApprovedClassType("Flavored Gin")).toBe(true);
  });

  it("approves Flavored Rum", () => {
    expect(isApprovedClassType("Flavored Rum")).toBe(true);
  });

  it("approves Flavored Brandy", () => {
    expect(isApprovedClassType("Flavored Brandy")).toBe(true);
  });

  it("approves Flavored Whisky", () => {
    expect(isApprovedClassType("Flavored Whisky")).toBe(true);
  });

  it("approves Flavored Whiskey (alt spelling)", () => {
    expect(isApprovedClassType("Flavored Whiskey")).toBe(true);
  });

  // Real-world flavored variants printed on labels
  it("approves Spiced Rum (Captain Morgan, Kraken)", () => {
    expect(isApprovedClassType("Spiced Rum")).toBe(true);
  });

  it("approves Coconut Rum (Malibu)", () => {
    expect(isApprovedClassType("Coconut Rum")).toBe(true);
  });

  it("approves Cinnamon Whisky (Fireball)", () => {
    expect(isApprovedClassType("Cinnamon Whisky")).toBe(true);
  });

  it("approves Honey Whiskey (Tennessee Honey, American Honey)", () => {
    expect(isApprovedClassType("Honey Whiskey")).toBe(true);
  });

  it("approves Apple Whisky (Crown Royal Apple)", () => {
    expect(isApprovedClassType("Apple Whisky")).toBe(true);
  });

  // Common cordials seen on US shelves
  it("approves Sambuca", () => {
    expect(isApprovedClassType("Sambuca")).toBe(true);
  });

  it("approves Crème de Menthe", () => {
    expect(isApprovedClassType("Crème de Menthe")).toBe(true);
  });

  it("approves Creme de Cacao (no accent)", () => {
    expect(isApprovedClassType("Creme de Cacao")).toBe(true);
  });

  it("approves Crème de Cassis", () => {
    expect(isApprovedClassType("Crème de Cassis")).toBe(true);
  });

  // Negative — fanciful expression that is not a CFR designation
  it("does not approve a fanciful expression name", () => {
    expect(isApprovedClassType("Tennessee Fire")).toBe(false);
  });
});
