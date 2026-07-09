import { describe, expect, it } from "vitest";

import {
  findPantoneColor,
  normalizePantoneQuery,
  parsePantoneDataset,
  parsePantoneLibraryDatasetForTest,
  parsePantoneSolidCoatedDataset,
  searchPantoneColors,
} from "./pantone";

const colors = parsePantoneDataset({
  "11-0103": { name: "egret", hex: "f3ece0" },
  "17-5641": { name: "emerald", hex: "009473" },
  "19-4052": { name: "classic-blue", hex: "0f4c81" },
}).concat(
  parsePantoneSolidCoatedDataset([
    { name: "Red 032 C", hex: "EF3340" },
    { name: "Warm Red C", hex: "F9423A" },
    { name: "Rubine Red C", hex: "CE0058" },
  ]),
  parsePantoneLibraryDatasetForTest(
    [{ code: "Red 032 U", name: "Red 032 U", hex: "F65058" }],
    "solid-uncoated",
  ),
);

describe("pantone color helpers", () => {
  it("normalizes Pantone prefixes and suffixes", () => {
    expect(normalizePantoneQuery("PANTONE 17-5641 TCX")).toBe("17-5641");
    expect(normalizePantoneQuery("pantone 19-4052 c")).toBe("19-4052");
  });

  it("finds colors by dashed and compact Pantone code", () => {
    expect(findPantoneColor(colors, "17-5641")?.name).toBe("emerald");
    expect(findPantoneColor(colors, "PANTONE 175641 TCX")?.name).toBe("emerald");
  });

  it("finds colors by color name", () => {
    expect(findPantoneColor(colors, "classic blue")?.code).toBe("19-4052");
  });

  it("finds Solid Coated colors by spaced, compact, and partial inputs", () => {
    expect(findPantoneColor(colors, "Red 032 C")?.hex).toBe("#ef3340");
    expect(findPantoneColor(colors, "Red032C")?.code).toBe("Red 032 C");
    expect(findPantoneColor(colors, "032")?.code).toBe("Red 032 C");
  });

  it("finds Solid Uncoated colors and prefers U suffix matches", () => {
    const result = findPantoneColor(colors, "Red 032 U");
    expect(result?.code).toBe("Red 032 U");
    expect(result?.catalog).toBe("solid-uncoated");
  });

  it("fuzzily tolerates close Solid Coated names", () => {
    expect(findPantoneColor(colors, "rubin red c")?.code).toBe("Rubine Red C");
  });

  it("ranks exact code matches first", () => {
    expect(searchPantoneColors(colors, "19", 2).map((color) => color.code)).toEqual(["19-4052"]);
  });
});
