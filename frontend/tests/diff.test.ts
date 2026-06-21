import { describe, it, expect } from "vitest";
import { lineDiff, diffStats } from "@/lib/diff";

describe("lineDiff", () => {
  it("marks every line 'same' for identical text", () => {
    const d = lineDiff("a\nb\nc", "a\nb\nc");
    expect(d.every((l) => l.type === "same")).toBe(true);
    expect(diffStats(d)).toEqual({ added: 0, removed: 0 });
  });

  it("detects an added line", () => {
    const d = lineDiff("a\nc", "a\nb\nc");
    expect(d.find((l) => l.type === "add")?.text).toBe("b");
    expect(diffStats(d)).toEqual({ added: 1, removed: 0 });
  });

  it("detects a removed line", () => {
    const d = lineDiff("a\nb\nc", "a\nc");
    expect(d.find((l) => l.type === "del")?.text).toBe("b");
    expect(diffStats(d)).toEqual({ added: 0, removed: 1 });
  });

  it("detects a changed line as one del + one add", () => {
    const d = lineDiff("hello world", "hello there");
    const stats = diffStats(d);
    expect(stats.added).toBe(1);
    expect(stats.removed).toBe(1);
  });

  it("handles empty old text (adds the new lines)", () => {
    const d = lineDiff("", "x\ny");
    // old "" is a single empty line replaced by two new lines.
    expect(diffStats(d)).toEqual({ added: 2, removed: 1 });
    expect(d.filter((l) => l.type === "add").map((l) => l.text)).toEqual(["x", "y"]);
  });
});
