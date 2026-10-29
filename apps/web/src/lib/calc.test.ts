import { describe, expect, it } from "vitest";
import { evaluateAmount, minorToInput } from "./calc";

describe("evaluateAmount", () => {
  it.each([
    ["1,250.50", 1250.5],
    ["12+8.5", 20.5],
    ["3*24.99", 74.97],
    ["100/4", 25],
    ["(20+5)*2", 50],
    ["10-2-3", 5],
    ["2+3*4", 14],
    ["-5+10", 5],
    ["7×3", 21],
    [".5", 0.5],
  ])("%s = %s", (input, expected) => {
    expect(evaluateAmount(input)).toBeCloseTo(expected, 10);
  });

  it.each(["", "abc", "2+", "1/0", "(2+3", "alert(1)", "2**3"])("rejects %j", (input) => {
    expect(evaluateAmount(input)).toBeNull();
  });
});

it("formats minor units for editing", () => {
  expect(minorToInput(125050)).toBe("1250.5");
  expect(minorToInput(5, 2)).toBe("0.05");
});
