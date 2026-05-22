import { apiRequest } from "./client";
import {
  taigaCreateEpic,
  taigaCreateStory,
  taigaGetEpic,
  taigaGetBoard,
  taigaListStoryStatuses,
  taigaUpdateStory,
} from "./taiga-direct";
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
  return taigaGetBoard(context.taigaToken, context.projectId, context.taigaApiUrl);
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

export function compileGherkin(context: RequestContext, nlDraft: string) {
  return apiRequest<{ stories: CompiledStory[] }>("/api/phase1/compile-gherkin", {
    method: "POST",
    context,
    body: { nl_draft: nlDraft },
    timeoutMs: 180_000,
  });
}

export function pushPhase1Stories(context: RequestContext, body: Phase1PushStoriesRequest) {
  return pushPhase1StoriesDirect(context, body);
}

async function pushPhase1StoriesDirect(
  context: RequestContext,
  body: Phase1PushStoriesRequest,
): Promise<Phase1PushStoriesResponse> {
  const epic = body.epic_id
    ? await taigaGetEpic(context.taigaToken, body.epic_id, context.taigaApiUrl)
    : await taigaCreateEpic(
      context.taigaToken,
      context.projectId,
      body.epic_subject ?? "",
      body.epic_description ?? "",
      [],
      context.taigaApiUrl,
    );
  const statuses = await taigaListStoryStatuses(context.taigaToken, context.projectId, context.taigaApiUrl).catch(() => []);
  const readyStatus = statuses.find((status) => status.name.toLowerCase().includes("ready for discovery"));
  const createdStories = [];
  for (const [index, story] of body.stories.entries()) {
    const created = await taigaCreateStory(
      context.taigaToken,
      context.projectId,
      epic.id,
      story.title,
      boldGherkinKeywords(story.gherkin),
      ["apex", "gherkin", story.size].filter(Boolean),
      undefined,
      context.taigaApiUrl,
    );
    const updated = readyStatus && created.version
      ? await taigaUpdateStory(
        context.taigaToken,
        created.id,
        created.version,
        { status: readyStatus.id },
        context.taigaApiUrl,
      ).catch(() => created)
      : created;
    createdStories.push({ ...updated, title: story.title, gherkin: story.gherkin, order: index });
  }
  return apiRequest<Phase1PushStoriesResponse>("/api/phase1/finalize-stories", {
    method: "POST",
    context,
    body: {
      epic_id: epic.id,
      epic_subject: epic.subject,
      stories: createdStories.map((story) => ({
        id: story.id,
        title: story.title,
        gherkin: story.gherkin,
      })),
    },
    timeoutMs: 120_000,
  });
}

function boldGherkinKeywords(gherkin: string) {
  return gherkin.replace(
    /^(Feature:|Background:|Scenario(?: Outline)?:|Examples:|Given|When|Then|And|But)\b/gm,
    "**$1**",
  );
}
