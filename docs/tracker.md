# TTB COLA Label Verifier — Project Tracker

Prototype for US Treasury / TTB to automate alcohol label application verification.
Agents upload a label image + application data; the system checks they match and comply with COLA requirements.

**Scope (v1):** Distilled spirits only — 27 CFR Part 5
**Target:** < 5 seconds end-to-end | **Deploy:** Vercel | **AI:** Gemini 2.5 Flash Lite

---

## Done

- Label image upload (drag-and-drop, JPEG/PNG/WEBP, max 10 MB)
- Application form with all 8 required COLA fields
- JSON and CSV file import to auto-populate the form
- Gemini Vision extraction — reads all COLA fields from the label image
- Validation engine — compares submitted vs extracted data per field
- Government warning auto-check — agents don't enter this; system verifies it automatically against official TTB text
- Per-field results with PASS / FAIL / REVIEW status and plain-English notes
- 27 CFR Part 5 compliance checks (ABV range, approved class/type designations, import country of origin)
- Proof ↔ ABV conversion (e.g., 70 Proof = 35% ABV)
- Unit normalization for net contents (mL ↔ L)
- Fuzzy matching for text fields — handles minor formatting differences and typos
- Compliance advisories layer — surfaces TTB rule observations (bottle size, age statement, statement of composition, state of distillation, production statement phrasing, fanciful name) as informational flags alongside the cross-validation result. Never affects the PASS / FAIL / REVIEW headline.
- 124 automated tests passing (unit, parser, advisory, and end-to-end pipeline)

---

## Planned

### Next
- ~~Deploy to Vercel and confirm public URL + < 5s response time~~ ✅ Live at https://cola-verify.vercel.app
- ~~Connect GitHub repo (`fsyeddev/ttb-label`) to Vercel for auto-deploy on push~~ ✅ Done
- ~~Expand approved class/type list to cover real-world labels (flavored class + common cordials)~~ ✅ Done — minor/specialty designations deliberately excluded

### Future
Each item below has a spec in [docs/specs/](specs/). A spec must be Approved before code is written.

- ~~**[Compliance Advisories](specs/compliance-advisories.md)** — surface TTB rule violations (bottle size, age statement, composition statement, etc.) as informational flags alongside the cross-validation results, without affecting the PASS / FAIL / REVIEW headline verdict~~ ✅ Done
- **[Wine support](specs/wine.md)** — 27 CFR Part 4 validation rules — *spec drafted, awaiting approval*
- **[Beer / Malt beverage support](specs/beer-malt.md)** — 27 CFR Part 7 validation rules — *placeholder*
- **[Batch upload](specs/batch-upload.md)** — submit multiple applications at once, aggregate results view, CSV export — *placeholder*
- **[Image pre-processing](specs/image-preprocessing.md)** — deskew, glare reduction, angle correction for low-quality photos — *placeholder*
- **[Live extraction evals](specs/live-extraction-evals.md)** — run eval suite against real label images (currently mocked) — *placeholder*

---

## Blocked / Known Issues

| # | Status | Issue |
|---|--------|-------|
| 1 | Open | Net contents not printed on the front face of some bottles (e.g., Jack Daniel's Tennessee Fire) — only appears on the bottle shoulder or back label. No fix possible without a second image. |
| 2 | Open | Gemini occasionally misreads the class/type field as a fanciful name (e.g., "Tennessee Fire" instead of "Cinnamon Liqueur") despite prompt guidance — inconsistent, happens on re-runs of the same image. Prompt mitigation is in place but not 100% reliable. |

---

## Approved Class/Type Designations — 27 CFR Part 5

### Whisky ✅ Partial
| Designation | Status |
|---|---|
| Bourbon Whisky/Whiskey | ✅ |
| Straight Bourbon Whisky/Whiskey | ✅ |
| Kentucky Straight Bourbon Whisky/Whiskey | ✅ |
| Tennessee Whisky/Whiskey | ✅ |
| Rye Whisky/Whiskey | ✅ |
| Straight Rye Whisky/Whiskey | ✅ |
| Scotch Whisky | ✅ |
| Blended Scotch Whisky | ✅ |
| Irish Whisky/Whiskey | ✅ |
| Canadian Whisky/Whiskey | ✅ |
| Blended Whisky/Whiskey | ✅ |
| Malt Whisky/Whiskey | ✅ |
| Grain Whisky/Whiskey | ✅ |
| American Whisky/Whiskey | ✅ |
| Light Whisky/Whiskey | ✅ |
| Spirit Whisky/Whiskey | ✅ |
| Wheat Whisky/Whiskey | ✅ Added |
| Straight Wheat Whisky/Whiskey | ✅ Added |
| Corn Whisky/Whiskey | ✅ Added |
| Straight Corn Whisky/Whiskey | ✅ Added |
| Rye Malt Whisky/Whiskey | ✅ Added |
| Straight Rye Malt Whisky/Whiskey | ✅ Added |
| Blended Bourbon Whisky (Bourbon — a Blend) | ✅ Added |
| Blended Rye Whisky/Whiskey | ✅ Added |
| Blend of Straight Bourbons | ✅ Added |
| Blend of Straight Rye Whiskies | ✅ Added |
| Blend of Straight Whiskies | ✅ Added |
| Single Malt Scotch Whisky | ✅ Added |
| Blended Malt Scotch Whisky | ✅ Added |
| Bottled-in-Bond (27 CFR Part 5.42) | ✅ Added |
| Flavored Whisky/Whiskey | ✅ Added |
| Cinnamon Whisky/Whiskey (Fireball) | ✅ Added |
| Honey Whisky/Whiskey (Tennessee Honey, American Honey) | ✅ Added |
| Apple Whisky/Whiskey (Crown Royal Apple) | ✅ Added |

### Gin ✅ Partial
| Designation | Status |
|---|---|
| Gin | ✅ |
| Distilled Gin | ✅ |
| Dry Gin | ✅ |
| London Dry Gin | ✅ |
| Compound Gin | ✅ Added |
| Old Tom Gin | ✅ Added |
| Genever / Geneva Gin | ✅ Added |
| Flavored Gin | ✅ Added |

### Vodka ✅
| Designation | Status |
|---|---|
| Vodka | ✅ |
| Flavored Vodka | ✅ Added |

### Rum ✅ Partial
| Designation | Status |
|---|---|
| Rum | ✅ |
| Light Rum | ✅ |
| Dark Rum | ✅ |
| Aged Rum | ✅ |
| Puerto Rican Rum | ✅ Added |
| Virgin Islands Rum | ✅ Added |
| Demerara Rum | ✅ Added |
| Agricole Rum | ✅ Added |
| Spiced Rum (Captain Morgan, Kraken) | ✅ Added |
| Coconut Rum (Malibu) | ✅ Added |
| Flavored Rum | ✅ Added |

### Brandy ✅ Partial
| Designation | Status |
|---|---|
| Brandy | ✅ |
| Cognac | ✅ |
| Armagnac | ✅ |
| Grape Brandy | ✅ |
| Fruit Brandy | ✅ |
| Calvados | ✅ |
| Grappa | ✅ |
| Pisco | ✅ |
| Apple Brandy / Applejack | ✅ Added |
| Blended Applejack | ✅ Added |
| Marc Brandy / Pomace Brandy | ✅ Added |
| Neutral Brandy | ✅ Added |
| Blend of Straight Brandies | ✅ Added |
| Flavored Brandy | ✅ Added |

### Tequila / Mezcal ✅ Partial
| Designation | Status |
|---|---|
| Tequila | ✅ |
| Blanco Tequila | ✅ |
| Reposado Tequila | ✅ |
| Añejo Tequila | ✅ |
| Mezcal | ✅ |
| Extra Añejo Tequila | ✅ Added |
| Joven Tequila | ✅ Added |

### Cordials & Liqueurs ✅
| Designation | Status |
|---|---|
| Cordial | ✅ |
| Liqueur | ✅ |
| Triple Sec | ✅ |
| Amaretto | ✅ |
| Schnapps | ✅ |
| Bitters | ✅ |
| Sloe Gin (classified as liqueur) | ✅ Added |
| Cinnamon Liqueur | ✅ Added |
| Sambuca | ✅ Added |
| Crème de Menthe | ✅ Added |
| Crème de Cacao | ✅ Added |
| Crème de Cassis | ✅ Added |

### Other / Specialty ✅ Partial
| Designation | Status |
|---|---|
| Neutral Spirits | ✅ |
| Grain Spirits | ✅ |
| Ethyl Alcohol | ✅ |
| Absinthe | ✅ |
| Aquavit | ✅ |
| Distilled Spirits Specialty | ✅ |
| Cachaça | ✅ Added |
| Shochu | ✅ Added |
| Baijiu | ✅ Added |
| Pálinka | ✅ Added |

---

## Notes

- See [technical-reference.md](technical-reference.md) for module details, file map, and architecture.
- Government warning is intentionally not a form field — TTB requires exact statutory text, so the system checks it automatically rather than asking agents to copy-paste it.
- The distinction between Brand Name and Fanciful Name (e.g., "Jack Daniel's" vs "Tennessee Fire") is a known TTB concept — v1 captures Brand Name only. Fanciful Name could be added as a separate field in a future iteration.
