import { describe, expect, it } from "vitest";

import { primaryEmailRecipient, splitEmailRecipients } from "@/lib/email/addresses";

describe("email address helpers", () => {
  it("splits recipient lists", () => {
    expect(splitEmailRecipients("a@example.com, b@example.com; c@example.com")).toEqual([
      "a@example.com",
      "b@example.com",
      "c@example.com",
    ]);
  });

  it("picks the first valid recipient", () => {
    expect(primaryEmailRecipient("bad, buyer@example.com, other@example.com")).toBe(
      "buyer@example.com",
    );
  });
});
