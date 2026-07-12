import { describe, expect, it } from "vitest";

import { fuzzyOptionMatch, type SearchableOption } from "./searchable-option-picker";

const option: SearchableOption = {
  value: "usd",
  label: "USD - US Dollar",
  description: "$",
  searchText: "United States currency",
};

describe("fuzzyOptionMatch", () => {
  it("matches labels, descriptions, and search text", () => {
    expect(fuzzyOptionMatch(option, "dollar")).toBe(true);
    expect(fuzzyOptionMatch(option, "$")).toBe(true);
    expect(fuzzyOptionMatch(option, "United States")).toBe(true);
  });

  it("supports ordered fuzzy characters", () => {
    expect(fuzzyOptionMatch(option, "usdlr")).toBe(true);
    expect(fuzzyOptionMatch(option, "yen")).toBe(false);
  });
});
