import { describe, it, expect, beforeEach } from "vitest";
import { usePhase5Store } from "@/lib/stores/phase5-store";
import type { InfraDelta } from "@/lib/api/types";

const DELTA: InfraDelta = {
  needs_infra_change: true,
  rationale: "test",
  confidence: "high",
  evidence: "test",
  deltas: [],
};

beforeEach(() => {
  usePhase5Store.setState({
    selectedStoryId: null,
    currentStoryMeta: { title: "", epicTitle: "" },
    infraDelta: null,
    aiRecommendation: null,
    deltaSaved: false,
    deltaCleared: false,
    deployPackMd: null,
    packSaved: false,
    techLeadApproved: false,
    devopsApproved: false,
    rejectionFeedback: "",
  });
});

describe("usePhase5Store", () => {
  it("clearInfraDelta sets deltaCleared, distinct from the never-loaded starting state", () => {
    // Both states have infraDelta === null, but only one of them means
    // "the user just discarded this on purpose" — a caller gating a
    // resume-load query on infraDelta === null alone can't tell them apart.
    expect(usePhase5Store.getState().deltaCleared).toBe(false);
    usePhase5Store.getState().setInfraDelta(DELTA, true, true);
    usePhase5Store.getState().clearInfraDelta();
    const state = usePhase5Store.getState();
    expect(state.infraDelta).toBeNull();
    expect(state.aiRecommendation).toBeNull();
    expect(state.deltaSaved).toBe(false);
    expect(state.deltaCleared).toBe(true);
  });

  it("setInfraDelta resets deltaCleared — a fresh generate or a real resume load both count as loaded again", () => {
    usePhase5Store.getState().clearInfraDelta();
    expect(usePhase5Store.getState().deltaCleared).toBe(true);

    usePhase5Store.getState().setInfraDelta(DELTA, false, true);
    expect(usePhase5Store.getState().deltaCleared).toBe(false);
    expect(usePhase5Store.getState().infraDelta).toEqual(DELTA);
  });

  it("setInfraDelta resets deltaCleared on the non-recommendation (verdict-patch) path too", () => {
    usePhase5Store.getState().clearInfraDelta();
    usePhase5Store.getState().setInfraDelta(DELTA, false, false);
    expect(usePhase5Store.getState().deltaCleared).toBe(false);
  });

  it("setSelectedStoryId (switching story) resets deltaCleared along with the rest of the draft", () => {
    usePhase5Store.getState().clearInfraDelta();
    expect(usePhase5Store.getState().deltaCleared).toBe(true);
    usePhase5Store.getState().setSelectedStoryId(99);
    expect(usePhase5Store.getState().deltaCleared).toBe(false);
  });

  it("clearPhase5Draft resets deltaCleared", () => {
    usePhase5Store.getState().clearInfraDelta();
    usePhase5Store.getState().clearPhase5Draft();
    expect(usePhase5Store.getState().deltaCleared).toBe(false);
  });
});
