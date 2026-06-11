import { describe, expect, it } from "vitest";
import { decodeApexMeta, encodeApexMeta, reattachApexBlock } from "@/lib/hooks/use-phase3";
import type { Phase3Task } from "@/lib/api/types";

function task(overrides: Partial<Phase3Task> = {}): Phase3Task {
  return {
    id: 3,
    subject: "Implement login endpoint",
    description: "Add POST /auth/login with JWT issuance.",
    effort_estimate: "S",
    covered_scenarios: ["Successful login", "Wrong password"],
    predecessor_task_ids: [1, 2],
    ...overrides,
  };
}

describe("encodeApexMeta / decodeApexMeta round-trip", () => {
  it("preserves all fields including the local task id", () => {
    const encoded = encodeApexMeta(task());
    const decoded = decodeApexMeta(encoded);
    expect(decoded.description).toBe("Add POST /auth/login with JWT issuance.");
    expect(decoded.effort_estimate).toBe("S");
    expect(decoded.covered_scenarios).toEqual(["Successful login", "Wrong password"]);
    expect(decoded.predecessor_task_ids).toEqual([1, 2]);
    expect(decoded.apex_task_id).toBe(3);
  });

  it("survives a description containing a markdown horizontal rule", () => {
    const description = "Part one of the spec.\n\n---\n\nPart two after a divider.";
    const encoded = encodeApexMeta(task({ description }));
    const decoded = decodeApexMeta(encoded);
    expect(decoded.description).toBe(description);
    expect(decoded.apex_task_id).toBe(3);
  });

  it("is stable across repeated encode/decode cycles", () => {
    const description = "Intro.\n\n---\n\nDetails.";
    let current = encodeApexMeta(task({ description }));
    for (let i = 0; i < 3; i++) {
      const decoded = decodeApexMeta(current);
      current = encodeApexMeta(task({ description: decoded.description }));
    }
    expect(decodeApexMeta(current).description).toBe(description);
  });

  it("omits Covers and Depends lines when empty", () => {
    const encoded = encodeApexMeta(task({ covered_scenarios: [], predecessor_task_ids: [] }));
    expect(encoded).not.toContain("**Covers:**");
    expect(encoded).not.toContain("**Depends on tasks:**");
    const decoded = decodeApexMeta(encoded);
    expect(decoded.covered_scenarios).toEqual([]);
    expect(decoded.predecessor_task_ids).toEqual([]);
  });
});

describe("decodeApexMeta on legacy and plain descriptions", () => {
  it("returns defaults for a plain PM task description", () => {
    const decoded = decodeApexMeta("Just a manually created task.");
    expect(decoded.description).toBe("Just a manually created task.");
    expect(decoded.effort_estimate).toBe("M");
    expect(decoded.apex_task_id).toBeNull();
  });

  it("decodes pre-task-id metadata blocks with a positional fallback signal", () => {
    const legacy =
      "Do the thing.\n\n---\n\n**Apex Metadata**\n- **Effort:** S (2 pts)\n- **Depends on tasks:** 1";
    const decoded = decodeApexMeta(legacy);
    expect(decoded.description).toBe("Do the thing.");
    expect(decoded.effort_estimate).toBe("S");
    expect(decoded.predecessor_task_ids).toEqual([1]);
    expect(decoded.apex_task_id).toBeNull();
  });

  it("decodes the legacy apex-meta JSON comment format", () => {
    const legacy = 'Old task.\n\n[//]: # (apex-meta:{"effort":"L","predecessor_task_ids":[2]})';
    const decoded = decodeApexMeta(legacy);
    expect(decoded.effort_estimate).toBe("L");
    expect(decoded.predecessor_task_ids).toEqual([2]);
  });

  it("does not strip a user --- block that is not Apex metadata", () => {
    const text = "Spec part one.\n\n---\n\nSpec part two, no metadata here.";
    const decoded = decodeApexMeta(text);
    expect(decoded.description).toBe(text);
  });
});

describe("reattachApexBlock", () => {
  it("keeps the metadata block when editing the description", () => {
    const encoded = encodeApexMeta(task());
    const updated = reattachApexBlock(encoded, "Rewritten description.");
    const decoded = decodeApexMeta(updated);
    expect(decoded.description).toBe("Rewritten description.");
    expect(decoded.apex_task_id).toBe(3);
    expect(decoded.effort_estimate).toBe("S");
  });

  it("returns the new description unchanged when no block exists", () => {
    expect(reattachApexBlock("plain", "new text")).toBe("new text");
  });
});
