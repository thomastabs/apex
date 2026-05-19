import { apiRequest } from "./client";
import type {
  CompiledStory,
  Epic,
  EpicSuggestion,
  Phase1GenerateNlStoriesRequest,
  Phase1GenerateNlStoriesResponse,
  Phase1PushStoriesRequest,
  Phase1PushStoriesResponse,
  RequestContext,
} from "./types";

export function listPhase1Epics(context: RequestContext) {
  return apiRequest<Epic[]>("/api/phase1/epics", { context });
}

export function suggestPhase1Epics(context: RequestContext, hint = "") {
  return apiRequest<{ epics: EpicSuggestion[] }>("/api/phase1/suggest-epics", {
    method: "POST",
    context,
    body: { hint },
    timeoutMs: 120_000,
  });
}

export function generateNlStories(
  context: RequestContext,
  body: Phase1GenerateNlStoriesRequest,
) {
  return apiRequest<Phase1GenerateNlStoriesResponse>("/api/phase1/generate-nl-stories", {
    method: "POST",
    context,
    body,
    timeoutMs: 180_000,
  });
}

export function compileGherkin(nlDraft: string) {
  return apiRequest<{ stories: CompiledStory[] }>("/api/phase1/compile-gherkin", {
    method: "POST",
    body: { nl_draft: nlDraft },
    timeoutMs: 180_000,
  });
}

export function pushPhase1Stories(context: RequestContext, body: Phase1PushStoriesRequest) {
  return apiRequest<Phase1PushStoriesResponse>("/api/phase1/push-stories", {
    method: "POST",
    context,
    body,
    timeoutMs: 120_000,
  });
}
