import { describe, expect, it } from "vitest";
import { summarizeSignature } from "../src/selector";

describe("selector preview", () => {
  it("derives a function selector from a canonical function signature", () => {
    expect(summarizeSignature("transfer(address,uint256)")).toBe("0xa9059cbb");
  });
  it("accepts an explicit four-byte selector and rejects malformed input", () => {
    expect(summarizeSignature("0xA9059CBB")).toBe("0xa9059cbb");
    expect(summarizeSignature("withdraw everything")).toBe("");
  });
});
