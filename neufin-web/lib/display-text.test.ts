import { describe, expect, it } from "vitest";
import {
  parseStringListField,
  unwrapAccidentalJsonObjectString,
} from "./display-text";

describe("display-text", () => {
  it("unwraps JSON object recommendation strings", () => {
    const s = JSON.stringify({ recommendation: "Buy quality." });
    expect(unwrapAccidentalJsonObjectString(s)).toBe("Buy quality.");
  });

  it("leaves normal prose alone", () => {
    expect(unwrapAccidentalJsonObjectString("Stay diversified.")).toBe(
      "Stay diversified.",
    );
  });

  it("parses JSON array lines", () => {
    expect(parseStringListField('["a","b"]')).toEqual(["a", "b"]);
  });
});
