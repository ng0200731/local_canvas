import { describe, expect, it } from "vitest";

import { defaultWorkspaceOptions, normalizeWorkspaceOptions } from "./workspace-settings";

describe("workspace settings", () => {
  it("provides complete built-in currency and destination lists", () => {
    expect(defaultWorkspaceOptions("currency").length).toBeGreaterThan(100);
    expect(defaultWorkspaceOptions("destination-country").length).toBeGreaterThan(240);
  });

  it("normalizes saved sequence indexes", () => {
    const options = normalizeWorkspaceOptions("currency", [
      {
        id: "currency:USD",
        kind: "currency",
        code: "USD",
        name: "US Dollar",
        symbol: "$",
        sortIndex: 8,
      },
      {
        id: "currency:CNY",
        kind: "currency",
        code: "CNY",
        name: "Chinese Yuan",
        symbol: "CN¥",
        sortIndex: 2,
      },
    ]);

    expect(options.map((option) => [option.code, option.sortIndex])).toEqual([
      ["CNY", 0],
      ["USD", 1],
    ]);
  });
});
