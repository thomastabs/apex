import { apiRequest } from "./client";
import { getPmAdapter } from "./pm-factory";
import { taigaGetProject } from "./taiga-direct";
import { toPmCtx } from "./workspace";
import type {
  CompiledStory,
  EpicSuggestion,
  Phase1GenerateClarifyingQuestionsRequest,
  Phase1GenerateClarifyingQuestionsResponse,
  Phase1GenerateNlStoriesRequest,
  Phase1GenerateNlStoriesResponse,
  Phase1PushStoriesRequest,
  Phase1PushStoriesResponse,
  QaPair,
  RequestContext,
  RequirementGapReport,
} from "./types";

export type ExistingEpicInput = {
  title: string;
  description: string;
  stories: string[];
};

export type ExtraContextPayload = {
  extra_context_files?: string[];
};

// Project context for PM adapters. Delegates to the shared toPmCtx so Taiga
// gets the numeric projectId — using pmProjectId (the slug) here made the
// adapter send project=NaN→null and Taiga rejected epic/story creates with 400.
function pmCtx(context: RequestContext) {
  return toPmCtx(context);
}

export function listPhase1Epics(context: RequestContext) {
  return getPmAdapter(context.pmTool).getBoard(pmCtx(context));
}

export function suggestPhase1Epics(context: RequestContext, hint = "", signal?: AbortSignal, extraContextFiles: string[] = []) {
  return apiRequest<{ epics: EpicSuggestion[] }>("/api/phase1/suggest-epics", {
    method: "POST",
    context,
    body: { hint, extra_context_files: extraContextFiles },
    timeoutMs: 120_000,
    signal,
  });
}

export function analyzeRequirementGaps(
  context: RequestContext,
  existingEpics: ExistingEpicInput[],
  hint = "",
  signal?: AbortSignal,
  extraContextFiles: string[] = [],
) {
  return apiRequest<RequirementGapReport>("/api/phase1/analyze-gaps", {
    method: "POST",
    context,
    body: { existing_epics: existingEpics, hint, extra_context_files: extraContextFiles },
    timeoutMs: 180_000,
    signal,
  });
}

export function generateNlStories(
  context: RequestContext,
  body: Phase1GenerateNlStoriesRequest,
  signal?: AbortSignal,
  // When a Figma file is connected, passing the token lets the backend render the
  // screens matching this epic to PNGs for multimodal grounding (U1 parity with
  // the figma-first path). Optional — omit and generation stays text-only.
  figmaToken?: string,
) {
  return apiRequest<Phase1GenerateNlStoriesResponse>("/api/phase1/generate-nl-stories", {
    method: "POST",
    context,
    body,
    headers: figmaToken ? { "X-Figma-Token": figmaToken } : undefined,
    timeoutMs: 180_000,
    signal,
  });
}

export function generateStoriesFromFigma(
  context: RequestContext,
  body: {
    frames: Array<{ name: string; description?: string; node_id?: string }>;
    flows: Array<{ from_name: string; to_name: string }>;
    instructions?: string;
    file_key?: string;
    extra_context_files?: string[];
  },
  // Token + file_key let the backend render the frames to PNGs for multimodal
  // grounding (U1). Optional — omit and generation falls back to frame names.
  figmaToken?: string,
  signal?: AbortSignal,
) {
  return apiRequest<Phase1GenerateNlStoriesResponse>("/api/phase1/generate-stories-from-figma", {
    method: "POST",
    context,
    body,
    headers: figmaToken ? { "X-Figma-Token": figmaToken } : undefined,
    timeoutMs: 180_000,
    signal,
  });
}

export type CrossCheckScenario = { story_title: string; title: string; description: string };
export type CrossCheckResult = {
  primary_model: string;
  primary_label: string;
  alt_model: string;
  alt_label: string;
  agreed: string[];
  only_primary: CrossCheckScenario[];
  only_alt: CrossCheckScenario[];
};

export function crossCheckStories(
  context: RequestContext,
  body: Phase1GenerateNlStoriesRequest,
  altModel = "",
  signal?: AbortSignal,
) {
  // Two AI calls (primary + alt provider) — allow the long timeout.
  return apiRequest<CrossCheckResult>("/api/phase1/cross-check-stories", {
    method: "POST",
    context,
    body: { ...body, alt_model: altModel },
    timeoutMs: 300_000,
    signal,
  });
}

export interface Phase1Constraint {
  id: string;
  category: string;
  ears_type: string;
  text: string;
  rationale: string;
}

export function generateConstraints(context: RequestContext, signal?: AbortSignal, extraContextFiles: string[] = []) {
  return apiRequest<{ constraints: Phase1Constraint[]; constraints_md: string }>(
    "/api/phase1/generate-constraints",
    { method: "POST", context, body: { extra_context_files: extraContextFiles }, timeoutMs: 120_000, signal },
  );
}

export function generateClarifyingQuestions(
  context: RequestContext,
  body: Phase1GenerateClarifyingQuestionsRequest,
  signal?: AbortSignal,
) {
  return apiRequest<Phase1GenerateClarifyingQuestionsResponse>("/api/phase1/generate-clarifying-questions", {
    method: "POST",
    context,
    body,
    timeoutMs: 120_000,
    signal,
  });
}

export function compileGherkin(
  context: RequestContext,
  nlDraft: string,
  clarifications: QaPair[] = [],
  signal?: AbortSignal,
) {
  return apiRequest<{ stories: CompiledStory[] }>("/api/phase1/compile-gherkin", {
    method: "POST",
    context,
    body: { nl_draft: nlDraft, clarifications },
    timeoutMs: 180_000,
    signal,
  });
}

export function pushPhase1Stories(context: RequestContext, body: Phase1PushStoriesRequest) {
  return pushPhase1StoriesDirect(context, body);
}

function buildPhase1StoryDescription(
  epicSubject: string,
  story: CompiledStory,
  clarifications: QaPair[] = [],
) {
  const sections = [
    "## Apex Requirement Spec",
    "",
    "### Epic",
    epicSubject || "General",
    "",
    "### User Story",
    story.title,
    "",
    "### Size",
    story.size || "Unspecified",
    "",
    "### Acceptance Criteria (Gherkin)",
    "```gherkin",
    story.gherkin.trim(),
    "```",
  ];

  if (clarifications.length > 0) {
    sections.push(
      "",
      "### Clarifications",
      ...clarifications.map((qa) => `- **Q:** ${qa.question}\n  **A:** ${qa.answer}`),
    );
  }

  sections.push(
    "",
    "### Traceability",
    "- Source phase: Apex Phase 1 Requirements",
    "- Locked artifact: `functional-spec.md`",
    "- PM tags: `apex`, `gherkin`, story size",
  );

  return sections.join("\n");
}

async function pushPhase1StoriesDirect(
  context: RequestContext,
  body: Phase1PushStoriesRequest,
): Promise<Phase1PushStoriesResponse> {
  const adapter = getPmAdapter(context.pmTool);
  const ctx = pmCtx(context);

  const epic = body.epic_id
    ? await adapter.getEpic(ctx, String(body.epic_id))
    : await adapter.createEpic(ctx, body.epic_subject ?? "", body.epic_description ?? "", []);

  // Best-effort: fold answered Phase 1 clarifying Q&A into the epic description so
  // the richer detail reaches the team in the PM tool, not just functional-spec.md.
  // Never fails the push over this — same posture as the story-URL fetch below.
  if (body.clarifications?.length) {
    try {
      const block = [
        "**Clarifications (Phase 1 Q&A):**",
        ...body.clarifications.map((qa) => `- Q: ${qa.question}\n  A: ${qa.answer}`),
      ].join("\n");
      await adapter.updateEpic(ctx, String(epic.id), epic.version ?? 1, {
        description: `${epic.description ?? ""}\n\n${block}`.trim(),
      });
    } catch {
      // Write-back failed; clarifications still land in functional-spec.md via finalize-stories.
    }
  }

  let readyStatus: { id: string; name: string } | undefined;
  try {
    const statuses = await adapter.listStoryStatuses(ctx);
    readyStatus = statuses.find((s) => s.name.toLowerCase().includes("ready for discovery"));
  } catch {
    // Status fetch failed; stories created without status transition
  }

  const createdStories = [];
  const pushFailures: Array<{ title: string; error: string }> = [];

  for (const [index, story] of body.stories.entries()) {
    try {
      const created = await adapter.createStory(
        ctx,
        String(epic.id),
        story.title,
        buildPhase1StoryDescription(epic.subject, story, body.clarifications ?? []),
        ["apex", "gherkin", story.size].filter(Boolean),
        undefined,
      );
      const updated = readyStatus
        ? await adapter.updateStory(ctx, String(created.id), created.version ?? 1, { status: readyStatus.id })
            .then(() => created)
            .catch(() => created)
        : created;
      createdStories.push({ ...updated, title: story.title, gherkin: story.gherkin, order: index });
    } catch (err) {
      pushFailures.push({ title: story.title, error: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  if (createdStories.length === 0) {
    throw new Error(`All story pushes failed. First error: ${pushFailures[0]?.error ?? "unknown"}`);
  }

  // Build PM web URLs for created stories (best-effort)
  let storyUrls: string[] = [];
  try {
    if (context.pmTool === "jira") {
      const domain = (context.taigaApiUrl ?? "").replace(/\/+$/, "");
      storyUrls = createdStories.filter((s) => s.ref).map((s) => `${domain}/browse/${ctx.projectId}-${s.ref}`);
    } else {
      // Taiga: fetch project slug then build tree.taiga.io URLs
      const { slug } = await taigaGetProject(context.taigaToken, context.projectId, context.taigaApiUrl);
      if (slug) {
        const webBase = (context.taigaApiUrl ?? "")
          .replace("/api/v1", "")
          .replace("//api.taiga.io", "//tree.taiga.io")
          .replace(/\/+$/, "");
        storyUrls = createdStories.filter((s) => s.ref).map((s) => `${webBase}/project/${slug}/us/${s.ref}`);
      }
    }
  } catch { /* skip URLs if fetch fails */ }

  const finalized = await apiRequest<Phase1PushStoriesResponse>("/api/phase1/finalize-stories", {
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
      clarifications: body.clarifications ?? [],
    },
    timeoutMs: 120_000,
  });

  return {
    ...finalized,
    story_urls: storyUrls,
    push_failures: pushFailures.length > 0 ? pushFailures : undefined,
  };
}
