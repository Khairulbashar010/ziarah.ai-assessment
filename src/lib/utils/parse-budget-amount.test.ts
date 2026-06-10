import { describe, expect, it } from "vitest";
import { parseBudgetAmount } from "./parse-budget-amount";

describe("parseBudgetAmount", () => {
  it("parses plain numbers", () => {
    expect(parseBudgetAmount("3000")).toBe(3000);
    expect(parseBudgetAmount("3,000")).toBe(3000);
  });

  it("parses k/m/b suffixes", () => {
    expect(parseBudgetAmount("3", "k")).toBe(3000);
    expect(parseBudgetAmount("2.5", "K")).toBe(2500);
    expect(parseBudgetAmount("1.2", "m")).toBe(1_200_000);
    expect(parseBudgetAmount("5", "b")).toBe(5_000_000_000);
  });

  it("rejects invalid amounts", () => {
    expect(parseBudgetAmount("0", "k")).toBeUndefined();
    expect(parseBudgetAmount("abc", "k")).toBeUndefined();
    expect(parseBudgetAmount("3", "x")).toBeUndefined();
  });
});
