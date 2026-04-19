import { describe, expect, it } from "vitest";
import {
  FINANCIAL_EM_DASH,
  FINANCIAL_QUOTE_UNAVAILABLE,
  formatNativePrice,
  formatNativeValue,
  formatPortfolioTotalLine,
} from "./finance-content";

describe("finance-content", () => {
  it("exports stable labels for missing data", () => {
    expect(FINANCIAL_EM_DASH).toBe("—");
    expect(FINANCIAL_QUOTE_UNAVAILABLE).toBe("Quote unavailable");
  });

  it("uses em dash for missing price, explicit copy for missing value", () => {
    expect(formatNativePrice(null, "USD")).toBe(FINANCIAL_EM_DASH);
    expect(formatNativePrice(undefined, "GBP")).toBe(FINANCIAL_EM_DASH);
    expect(formatNativeValue(null, "USD")).toBe(FINANCIAL_QUOTE_UNAVAILABLE);
    expect(formatNativeValue(undefined, "VND")).toBe(FINANCIAL_QUOTE_UNAVAILABLE);
  });

  it("renders numeric zero as zero, not as missing", () => {
    expect(formatNativeValue(0, "VND")).toContain("0");
    expect(formatNativeValue(0, "USD")).toMatch(/\$?0/);
  });

  it("formats VND with grouping", () => {
    expect(formatNativeValue(1_500_000, "VND")).toMatch(/1[\s,]?500[\s,]?000/);
  });
});

describe("formatPortfolioTotalLine", () => {
  it("uses USD when single-currency", () => {
    expect(
      formatPortfolioTotalLine({
        totalValue: 12_345.67,
        multiCurrency: false,
      }),
    ).toMatch(/\$12,346/);
  });

  it("shows mixed-currency raw sum when flagged", () => {
    const s = formatPortfolioTotalLine({
      totalValue: 99_000_000,
      multiCurrency: true,
      portfolioCurrencies: ["USD", "VND"],
    });
    expect(s).toContain("Mixed CCY (USD, VND)");
    expect(s).toContain("99,000,000");
  });
});
