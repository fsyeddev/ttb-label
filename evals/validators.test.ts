import { describe, it, expect } from 'vitest';
import { parseABV, compareABV, compareNetContents, compareGovernmentWarning, GOVERNMENT_WARNING_OFFICIAL } from '@/lib/validators/regex';
import { fuzzyEqual, compareTextField, compareCompanyName, compareAddressField } from '@/lib/validators/semantic';
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

  it("fails when warning is present but severely truncated", () => {
    const partial = "GOVERNMENT WARNING: (1) According to the Surgeon General...";
    const r = compareGovernmentWarning(GOVERNMENT_WARNING_OFFICIAL, partial);
    expect(r.status).toBe("fail");
    expect(r.note).toMatch(/statutory wording is exact/i);
  });

  it("fails when warning has OCR noise beyond hyphen joining (e.g. 'casue' typo)", () => {
    // joinHyphens cleans "Gen- eral" and "Consump- tion" — those normalize to
    // pass. But "casue" (transposed 'u'/'s') is a 2-char distance from "cause"
    // and is not cleaned by any normalization step → hard fail.
    const withHyphensAndNoise =
      "GOVERNMENT WARNING: (1) According to the Surgeon Gen- eral, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consump- tion of alcoholic beverages impairs your ability to drive a car or operate machinery, and may casue health problems.";
    const r = compareGovernmentWarning(GOVERNMENT_WARNING_OFFICIAL, withHyphensAndNoise);
    expect(r.status).toBe("fail");
  });

  it("fails when warning is completely absent", () => {
    const r = compareGovernmentWarning(GOVERNMENT_WARNING_OFFICIAL, "No warning here");
    expect(r.status).toBe("fail");
  });

  // ─── Sneaky one-word substitutions — BUG-08 cat-6 fixtures ─────────────────
  // The government warning has exact statutory wording; subtle substitutions
  // must not auto-pass. Each test below mirrors a real cat-6 fixture from
  // evals/fixtures/generated/06-warning-sneaky-{01,03,04,05}.json.

  it("fails when 'may cause' is substituted with 'could cause'", () => {
    const sneaky = GOVERNMENT_WARNING_OFFICIAL.replace("may cause", "could cause");
    const r = compareGovernmentWarning(GOVERNMENT_WARNING_OFFICIAL, sneaky);
    expect(r.status).toBe("fail");
  });

  it("fails when 'a Surgeon General' replaces 'the Surgeon General'", () => {
    const sneaky = GOVERNMENT_WARNING_OFFICIAL.replace("the Surgeon General", "a Surgeon General");
    const r = compareGovernmentWarning(GOVERNMENT_WARNING_OFFICIAL, sneaky);
    expect(r.status).toBe("fail");
  });

  it("fails when 'alcohol beverages' replaces 'alcoholic beverages' in the first sentence", () => {
    const sneaky = GOVERNMENT_WARNING_OFFICIAL.replace("alcoholic beverages", "alcohol beverages");
    const r = compareGovernmentWarning(GOVERNMENT_WARNING_OFFICIAL, sneaky);
    expect(r.status).toBe("fail");
  });

  it("fails when colon is missing after GOVERNMENT WARNING", () => {
    const sneaky = GOVERNMENT_WARNING_OFFICIAL.replace("GOVERNMENT WARNING:", "GOVERNMENT WARNING");
    const r = compareGovernmentWarning(GOVERNMENT_WARNING_OFFICIAL, sneaky);
    expect(r.status).toBe("fail");
  });

  // ─── BUG-09 — Case-insensitive body comparison ─────────────────────────────
  // Regression observed live on Jack Daniel's Tennessee Fire: the entire
  // warning body is set in ALL CAPS on the label. The prefix is correctly
  // capitalized, the wording matches the statute word-for-word, but the
  // Levenshtein distance counted every body letter as a substitution edit
  // (~200 chars) and hard-failed. After the fold, body case is irrelevant.

  it("passes when the entire body is set in ALL CAPS but wording is exact", () => {
    const allCaps = GOVERNMENT_WARNING_OFFICIAL.toUpperCase();
    const r = compareGovernmentWarning(GOVERNMENT_WARNING_OFFICIAL, allCaps);
    expect(r.status).toBe("pass");
  });

  it("passes the actual Jack Daniel's Tennessee Fire extracted warning", () => {
    // Verbatim from the OCR output reported on https://cola-verify.vercel.app
    // (single-line, dashes joined, body in caps).
    const jackDaniels =
      "GOVERNMENT WARNING: (1) ACCORDING TO THE SURGEON GENERAL, WOMEN SHOULD NOT DRINK ALCOHOLIC BEVERAGES DURING PREGNANCY BECAUSE OF THE RISK OF BIRTH DEFECTS. (2) CONSUMPTION OF ALCOHOLIC BEVERAGES IMPAIRS YOUR ABILITY TO DRIVE A CAR OR OPERATE MACHINERY, AND MAY CAUSE HEALTH PROBLEMS.";
    const r = compareGovernmentWarning(GOVERNMENT_WARNING_OFFICIAL, jackDaniels);
    expect(r.status).toBe("pass");
  });

  it("still hard-fails when the prefix is title-cased — gate unaffected by body fold", () => {
    // Title-case prefix must still be a hard fail; only the body comparison
    // is case-insensitive after this gate.
    const prefixTitleCase = GOVERNMENT_WARNING_OFFICIAL.replace(
      "GOVERNMENT WARNING:",
      "Government Warning:"
    );
    const r = compareGovernmentWarning(GOVERNMENT_WARNING_OFFICIAL, prefixTitleCase);
    expect(r.status).toBe("fail");
    expect(r.note).toMatch(/all capital/i);
  });

  it("fails when warning is wholly different text", () => {
    const garbage =
      "GOVERNMENT WARNING: This product may contain ingredients that some people find delicious. Side effects include enjoying yourself. Drink responsibly within reason.";
    const r = compareGovernmentWarning(GOVERNMENT_WARNING_OFFICIAL, garbage);
    expect(r.status).toBe("fail");
    expect(r.note).toMatch(/statutory wording is exact/i);
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

// ─── compareCompanyName — BUG-01 strict-match comparator ────────────────────
//
// Two outcomes only for brand_name and bottler_name:
//   - pass: fuzzyEqual(submitted, extracted) is true (case/whitespace/apostrophe/
//     dash differences absorbed by normalize()).
//   - fail: anything else. BUG-01 invariant — no similarity band, no warning tier.
//
// Case is not regulated by TTB for brand/bottler fields (27 CFR Part 5).
// Visual verification (docs/specs/visual-verification.md) remains the catch
// path for OCR-side discrepancies. The text comparator stays strict so it
// never silently papers over agent-form errors.
// See docs/specs/company-name-suffix-strip.md and docs/specs/case-insensitive-and-address-substring.md.

describe("compareCompanyName — BUG-01", () => {
  it("fails on shared-suffix mismatch — the BUG-01 case", () => {
    // Pre-fix: similarity ~0.69 lands in the warning band → false-warning on
    // totally unrelated companies. Post-fix: not fuzzyEqual → fail.
    const r = compareCompanyName("Wrong Distilling Co.", "Prairie Wind Distilling Co.", "Bottler Name");
    expect(r.status).toBe("fail");
    expect(r.note).toMatch(/Wrong Distilling Co\./);
    expect(r.note).toMatch(/Prairie Wind Distilling Co\./);
  });

  it("fails on OCR truncation (label vs full form name)", () => {
    // E.g., Gemini truncated "Old Cypress Distillery" to "Old Cypress" (BUG-02).
    // We deliberately do NOT try to detect OCR truncation here — the text
    // comparator can't distinguish OCR error from human error. Visual
    // verification will surface this to the agent (planned, see spec).
    const r = compareCompanyName("Old Cypress Distillery", "Old Cypress", "Brand Name");
    expect(r.status).toBe("fail");
  });

  it("fails on suffix typo — does not paper over near-misses", () => {
    // "Distilery" vs "Distillery" (one missing l). We refuse to treat this as
    // a match: typo on the form is exactly what the system needs to surface.
    const r = compareCompanyName("Old Tom Distillery", "Old Tom Distilery", "Bottler Name");
    expect(r.status).toBe("fail");
  });

  it("fails on core-name typo — agent form errors are caught, not papered over", () => {
    const r = compareCompanyName("Jak Daniels", "Jack Daniels", "Brand Name");
    expect(r.status).toBe("fail");
  });

  it("passes on case-only difference (case is not regulated for company-name fields)", () => {
    const r = compareCompanyName("OLD TOM DISTILLERY", "Old Tom Distillery", "Brand Name");
    expect(r.status).toBe("pass");
  });

  it("passes on exact match (case-sensitive)", () => {
    const r = compareCompanyName("Old Tom Distillery", "Old Tom Distillery", "Brand Name");
    expect(r.status).toBe("pass");
    expect(r.note).toBeUndefined();
  });

  it("passes on whitespace variant (normalize collapses runs of whitespace)", () => {
    const r = compareCompanyName("Jack Daniel's  Distillery", "Jack Daniel's Distillery", "Brand Name");
    expect(r.status).toBe("pass");
  });

  // Note: normalize() in semantic.ts does NOT currently fold curly quotes
  // (U+2018 / U+2019) to a straight apostrophe — only ASCII apostrophe and
  // backtick. So `"Jack Daniel’s"` (curly) vs `"Jack Daniel's"` (straight)
  // currently fails compareCompanyName. That's a separate normalize-wide
  // gap (would affect every field using normalize), tracked for a future
  // change — deliberately out of scope for BUG-01.

  it("fails on punctuation-only difference — strict because we can't tell OCR from human", () => {
    // "Co." vs "Co" — could be either side dropping/adding a period. We default
    // to fail; visual verification is the right place to disambiguate.
    const r = compareCompanyName("Old Tom Co.", "Old Tom Co", "Bottler Name");
    expect(r.status).toBe("fail");
  });

  it("fails when extracted is null", () => {
    const r = compareCompanyName("Old Tom Distillery", null, "Brand Name");
    expect(r.status).toBe("fail");
    expect(r.note).toMatch(/not found on label/i);
  });

  it("fails when submitted is null", () => {
    const r = compareCompanyName(null, "Old Tom Distillery", "Brand Name");
    expect(r.status).toBe("fail");
    expect(r.note).toMatch(/not provided in application/i);
  });

  it("never returns warning for real text mismatches — BUG-01 invariant", () => {
    // The comparator is binary: pass or fail. Any difference that isn't
    // fuzzyEqual must hard-fail; we never let a typo, truncation,
    // shared-suffix collision, or punctuation drift slip through.
    const cases: Array<[string, string]> = [
      ["Old Tom Distillery", "Old Tom Distilery"],     // typo
      ["Wrong Distilling Co.", "Prairie Wind Distilling Co."], // BUG-01
      ["Old Cypress Distillery", "Old Cypress"],       // truncation
      ["Old Tom Co.", "Old Tom Co"],                   // punctuation
    ];
    for (const [s, e] of cases) {
      const r = compareCompanyName(s, e, "Test");
      expect(r.status, `for "${s}" vs "${e}"`).toBe("fail");
    }
  });

  it("passes on case-difference combined with extra whitespace", () => {
    const r = compareCompanyName("OLD CYPRESS  DISTILLERY", "Old Cypress Distillery", "Brand Name");
    expect(r.status).toBe("pass");
  });
});

// ─── compareAddressField — substring-aware address comparator ────────────────

describe("compareAddressField", () => {
  it("passes on exact address match", () => {
    const r = compareAddressField("Portland, OR 97201", "Portland, OR 97201", "Bottler Address");
    expect(r.status).toBe("pass");
  });

  it("passes when application is a substring of label (case-insensitive)", () => {
    const r = compareAddressField(
      "Port Ellen, Isle of Islay",
      "PORT ELLEN, ISLE OF ISLAY PA42 7DZ, SCOTLAND",
      "Bottler Address"
    );
    expect(r.status).toBe("pass");
    expect(r.note).toMatch(/additional detail/i);
  });

  it("passes when application is a casing variant of label", () => {
    const r = compareAddressField(
      "port ellen, isle of islay",
      "Port Ellen, Isle of Islay",
      "Bottler Address"
    );
    expect(r.status).toBe("pass");
  });

  it("falls back to similarity tier when neither equality nor substring holds", () => {
    const r = compareAddressField("Louisville, KY", "Lexington, KY", "Bottler Address");
    expect(r.status).toBe("fail");
  });

  it("fails when extracted is null", () => {
    const r = compareAddressField("Portland, OR 97201", null, "Bottler Address");
    expect(r.status).toBe("fail");
    expect(r.note).toMatch(/not found on label/i);
  });

  it("fails when submitted is null", () => {
    const r = compareAddressField(null, "Portland, OR 97201", "Bottler Address");
    expect(r.status).toBe("fail");
    expect(r.note).toMatch(/not provided in application/i);
  });
});

// ─── compareTextField (unchanged — still tiered for non-company fields) ─────

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
