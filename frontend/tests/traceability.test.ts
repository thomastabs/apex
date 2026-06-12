import { describe, expect, it } from "vitest";
import { buildTraceabilityMatrix, parseGherkinScenarioTitles } from "@/lib/hooks/use-phase5";

const GHERKIN = `Feature: User Login
  Scenario: Successful login
    Given a registered user
    When they submit valid credentials
    Then they receive a JWT token

  Scenario Outline: Invalid password
    Given a registered user
    When they submit "<password>"
    Then they see an error
`;

describe("parseGherkinScenarioTitles", () => {
  it("extracts Scenario and Scenario Outline titles", () => {
    expect(parseGherkinScenarioTitles(GHERKIN)).toEqual(["Successful login", "Invalid password"]);
  });

  it("dedupes repeated titles", () => {
    const g = "Scenario: A\nScenario: A\nScenario: B";
    expect(parseGherkinScenarioTitles(g)).toEqual(["A", "B"]);
  });

  it("returns empty for non-gherkin text", () => {
    expect(parseGherkinScenarioTitles("# Just a doc")).toEqual([]);
  });
});

describe("buildTraceabilityMatrix", () => {
  const tasks = [
    { id: 1, covered_scenarios: ["Successful login"] },
    { id: 2, covered_scenarios: ["successful login ", "Invalid password"] }, // case/space drift
  ];

  it("joins scenarios to tasks with normalized names", () => {
    const m = buildTraceabilityMatrix(GHERKIN, tasks, new Set([1, 2]), [])!;
    expect(m.scenarios[0].tasks).toEqual([1, 2]);
    expect(m.scenarios[1].tasks).toEqual([2]);
    expect(m.summary.covered).toBe(2);
  });

  it("flags NO_COVERING_TASK and NOT_TESTED", () => {
    const m = buildTraceabilityMatrix(GHERKIN, [], new Set(), [])!;
    expect(m.scenarios[0].gaps).toEqual(["NO_COVERING_TASK", "NOT_TESTED"]);
    expect(m.complete).toBe(false);
  });

  it("flags TASK_WITHOUT_PACK when a covering task has no proposal", () => {
    const m = buildTraceabilityMatrix(GHERKIN, tasks, new Set([1]), [])!;
    expect(m.scenarios[0].gaps).toContain("TASK_WITHOUT_PACK");
    expect(m.summary.with_pack).toBe(0); // neither scenario fully packed
  });

  it("uses the latest QA attempt verdict per scenario", () => {
    const attempts = [
      { results: [{ scenario: "Successful login", result: "fail" as const }] },
      { results: [{ scenario: "successful login", result: "pass" as const }] },
    ];
    const m = buildTraceabilityMatrix(GHERKIN, tasks, new Set([1, 2]), attempts)!;
    expect(m.scenarios[0].qa_result).toBe("pass");
    expect(m.scenarios[1].qa_result).toBe("untested");
  });

  it("surfaces orphan covers lines without counting them in totals", () => {
    const drifted = [{ id: 3, covered_scenarios: ["Renamed scenario"] }];
    const m = buildTraceabilityMatrix(GHERKIN, drifted, new Set([3]), [])!;
    const orphan = m.scenarios.find((r) => r.gaps.includes("ORPHAN_COVERS"))!;
    expect(orphan.scenario).toContain("Renamed scenario");
    expect(m.summary.total).toBe(2); // orphans excluded from the denominator
  });

  it("is complete when every scenario is covered, packed, and tested", () => {
    const attempts = [{
      results: [
        { scenario: "Successful login", result: "pass" as const },
        { scenario: "Invalid password", result: "pass" as const },
      ],
    }];
    const full = [
      { id: 1, covered_scenarios: ["Successful login"] },
      { id: 2, covered_scenarios: ["Invalid password"] },
    ];
    const m = buildTraceabilityMatrix(GHERKIN, full, new Set([1, 2]), attempts)!;
    expect(m.summary).toEqual({ total: 2, covered: 2, with_pack: 2, tested: 2, gap_count: 0 });
    expect(m.complete).toBe(true);
  });

  it("returns null when the gherkin has no scenarios", () => {
    expect(buildTraceabilityMatrix("no scenarios here", tasks, new Set(), [])).toBeNull();
  });
});
