import { safeArray, safeMode, safeObject, safeString } from "./useProgressPersistence";

describe("progress persistence coercion helpers", () => {
  it("coerces persisted values safely", () => {
    expect(safeArray(null)).toEqual([]);
    expect(safeArray([1, 2])).toEqual([1, 2]);
    expect(safeObject([])).toEqual({});
    expect(safeObject({ okay: true })).toEqual({ okay: true });
    expect(safeString(42, "fallback")).toBe("fallback");
    expect(safeString("value", "fallback")).toBe("value");
  });

  it("normalizes unsupported modes back to known routes", () => {
    expect(safeMode("calendar")).toBe("dashboard");
    expect(safeMode("quiz")).toBe("quiz");
    expect(safeMode("unknown")).toBe("flashcard");
  });
});
