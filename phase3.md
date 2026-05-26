# Phase 3: Implementation Assist

## Context

Phase 3 turns a design-locked story into a **developer-ready context pack** — not generated code, but a structured markdown bundle that any developer can take into Claude, Cursor, or ChatGPT and immediately start working. The core artifact is the "Developer Pack": context summary + implementation steps + test assertions + a paste-ready AI prompt. Secondary: GitHub issue creation and branch creation (requires `GITHUB_TOKEN` + `GITHUB_REPO`).

Phase 1 locked Gherkin. Phase 2 locked tech stack + 3-section design bundle (UX Brief → Endpoints → Data Model). Phase 3 consumes all of this, decomposes each story into atomic tasks, and generates per-task context packs. No code is written by Apex — only context is packaged.

**Phase 2 design bundle structure (what Phase 3 inherits):**
- `design-bundle.md` — UX Brief + Endpoints (auth/in/out contracts) + Data Model (entities + relations)
- `technical-spec.md` — Endpoints section only (for per-story `get_story_technical_spec()`)
- Story index now includes `epic_title` field (captured from functional-spec.md)

---

## Workflow (User-Facing)

**Stage A — Story Selection**
- List stories where `phase_status == "design_locked"` from story index
- Show Gherkin + tech spec excerpt per story
- Select one story to work on

**Stage B — Task Decomposition**
- Display full Gherkin + technical spec (read-only)
- "Generate Tasks" → AI returns 3–7 atomic tasks `{id, subject, description}`
- User can edit: rename, reorder, delete, add tasks manually

**Stage B.5 — Push Tasks to Taiga** _(after task list is finalised)_
- "Push Tasks to Taiga" button (same pattern as Phase 1's "Push to Taiga")
- Creates Taiga **tasks** (subtasks, not stories) under the parent user story via `POST /tasks`
- Returns Taiga task refs; stored in phase3 store (`taigaTaskIds`)
- Proposals generated after push include Taiga task ref in their Context section
- Browser-side (consistent with all Taiga calls being browser-side)

**Stage C — Developer Pack** (per task)
- Select a task
- "Generate Pack" → AI returns structured markdown:
  - **Context** — stack, story ref, relevant spec excerpt
  - **Implementation Steps** — numbered, file-level
  - **Test Assertions** — derived from Gherkin scenarios
  - **AI Prompt block** — paste-ready, assembled from above sections
- User edits pack in textarea with live markdown preview
- "Download .md" and "Copy AI Prompt" buttons per pack

**Stage D — Lock & Export**
- Single gate: user reviews, clicks "Lock & Export"
- Saves all packs to context files via `save_proposal()`
- Transitions story: `phase_status="implementation"`, `has_proposal=True`
- Optional GitHub: "Create Issue" + "Create Branch" (if configured)

---

## Backend

### New files

**`backend/app/api/phase3.py`**
Routes (prefix `/api/phase3`):
```
GET  /eligible-stories              → list of design_locked stories with gherkin + spec preview
GET  /story-context/{story_id}      → full gherkin + technical_spec strings
POST /generate-tasks                → {story_id} → [{id, subject, description}, ...]
POST /generate-proposal             → {story_id, task_id, task_subject, task_description} → markdown pack string
POST /save-proposal                 → {story_id, task_id, proposal_md} → {ok: true}
POST /lock-story                    → {story_id, task_ids} → transitions phase_status to "implementation"
```
All routes: require `X-Taiga-Project-Id` header (same `get_request_context()` pattern as Phase 2).
`/generate-tasks` and `/generate-proposal`: add `ai_rate_limit` dependency.

**`backend/app/services/phase3_service.py`**
```python
class Phase3Service:
    def __init__(self, ai=None, context=None): ...
    def get_eligible_stories(self) -> list[dict]
    def get_story_context(self, story_id: int) -> dict       # gherkin + technical_spec
    def generate_tasks(self, story_id: int) -> list[dict]
    def generate_proposal(self, story_id: int, task_id: int, task_subject: str, task_description: str) -> str
    def save_proposal(self, story_id: int, task_id: int, proposal_md: str) -> None
    def lock_story(self, story_id: int) -> None              # upsert_story_index(implementation)
```
Uses `context_manager.get_context_for_phase(3, story_id)` for full Phase 3 context injection.

**`backend/app/schemas/phase3.py`**
```python
class GenerateTasksRequest(BaseModel):
    story_id: int
class GenerateProposalRequest(BaseModel):
    story_id: int; task_id: int; task_subject: str; task_description: str
class SaveProposalRequest(BaseModel):
    story_id: int; task_id: int; proposal_md: str
class LockStoryRequest(BaseModel):
    story_id: int; task_ids: list[int]
```

**`backend/app/api/github.py`** _(secondary — build after core works)_
```
GET  /api/github/config             → {configured: bool, repo: str|null}
POST /api/github/create-issue       → {title, body, labels} → {issue_url, issue_number}
POST /api/github/create-branch      → {story_id, story_slug} → {branch_name, branch_url}
GET  /api/github/repo-tree          → flat file list for context enrichment (optional)
```
Reads `GITHUB_TOKEN`, `GITHUB_REPO` (format: `owner/repo`) from env.
Uses GitHub REST API directly — no SDK dependency.

### Modified files

**`backend/app/main.py`** — register `phase3_router` (same pattern as phase1/phase2 routers)

**`src/ai_engine.py`** (lines 981–992 stubs → implement)

`generate_tasks(story_subject, gherkin, technical_spec)`:
- System: decompose story into 3–7 atomic, independently-implementable tasks
- Returns structured list: `[{id, subject, description}]`
- Use `_invoke_structured_with_progress()` with Pydantic schema

`generate_coding_proposal(task_subject, task_description, gherkin, technical_spec, tech_stack="")`:
- Returns plain-text markdown pack (not structured — same as `generate_design_ux_brief` pattern)
- Uses `_invoke()` (non-streaming)
- Output sections: Context / Implementation Steps / Test Assertions / AI Prompt
- **Rich context from Phase 2**: `technical_spec` has structured endpoint contracts (`METHOD /path · auth:bearer · in:{field:type} · out:{field:type}`); `design_bundle` also contains the full Data Model (entities + relations). The prompt instructs AI to reference exact endpoint contracts in Implementation Steps AND use entity definitions from the Data Model when generating field-level guidance — never invent signatures or entities.

Pack AI Prompt block format (generated inside the markdown):
```
## AI Prompt

You are implementing a specific task within a software project.

**Tech Stack**: {tech_stack}
**Story**: US#{story_id} — {story_title}
**Acceptance Criteria**:
{gherkin}

**Your Task**: {task_subject}
{task_description}

**Implementation Steps**:
{numbered steps}

**Required test coverage**:
{test_assertions}
```

### Reused from existing code

- `context_manager.save_proposal(story_id, task_id, proposal)` — already implemented, saves to `proposal_story_{id}_task_{id}.md`
- `context_manager.upsert_story_index(story_id, phase_status="implementation", has_proposal=True)`
- `context_manager.get_story_gherkin(story_id)` and `get_story_technical_spec(story_id)` (endpoints section)
- Story index `epic_title` field (captured since `5a21e90`) — use to group eligible stories by epic in the UI
- `context_manager.get_context_for_phase(3, story_id)` — Project Concept + Tech Stack + Gherkin + Technical Spec

---

## Frontend

### New files

**`frontend/components/phase3-workflow.tsx`** — main UI (~500 lines estimated)
Stages A→D, draft persistence to `localStorage` key `apex-phase3-draft-{projectId}`.

**`frontend/lib/api/taiga-direct.ts`** — add `taigaCreateTask()`:
```typescript
async function taigaCreateTask(
  token: string, projectId: number,
  storyId: number,              // Taiga user story ID (parent)
  subject: string, description: string,
  apiBaseUrl?: string,
): Promise<{ id: number; ref: number; subject: string }>
// POST /tasks  { project, user_story, subject, description }
```
All Taiga calls remain browser-side (no backend proxy).

**`frontend/lib/api/phase3.ts`** — API client functions (mirror `lib/api/phase2.ts` pattern)

**`frontend/lib/hooks/use-phase3.ts`** — React Query hooks:
- `useEligibleStories()` — query
- `useStoryContext(storyId)` — query (enabled when story selected)
- `useGenerateTasks()` — mutation (backend)
- `usePushTasksToTaiga()` — mutation (browser→Taiga direct, calls `taigaCreateTask()` per task; stores returned IDs in phase3 store)
- `useGenerateProposal()` — mutation (backend; injects `taigaTaskRef` into proposal if tasks already pushed)
- `useSaveProposal()` — mutation
- `useLockStory()` — mutation
- `useGithubConfig()` — query (optional, checks if GitHub is configured)
- `useCreateGithubIssue()` — mutation (optional)
- `useCreateBranch()` — mutation (optional)

**`frontend/lib/stores/phase3-store.ts`** — Zustand:
```typescript
{
  selectedStoryId: number | null
  taskList: Task[]                          // [{id, subject, description}]
  taigaTaskIds: Record<number, number>      // task_index → taiga_task_id
  taigaTaskRefs: Record<number, number>     // task_index → taiga_task_ref (e.g. #42)
  tasksPushed: boolean
  packDrafts: Record<number, string>        // task_id → markdown
  lockedTaskIds: number[]
  githubIssueUrl: string | null
  branchName: string | null
}
```

### Modified files

**`frontend/app/phase3/page.tsx`** — replace `<PhasePlaceholder>` with `<Phase3Workflow />`

**`frontend/components/command-palette.tsx`** — no change needed (Phase 3 nav already wired)

---

## Export

**Download format — self-contained markdown** (per task pack):

The downloaded `.md` includes the developer pack **plus a full Context Appendix** of every context file that drove generation. Developer needs nothing else to start.

```markdown
# Developer Pack — {task_subject}
## Story: US#{id} — {story_title}

## Context Summary
...

## Implementation Steps
...

## Test Assertions
...

## AI Prompt
...

---

# Context Appendix
> Files used to generate this pack

## Project Concept
{project_concept content}

## Tech Stack
{tech_stack content}

## Acceptance Criteria (Gherkin)
{story gherkin}

## Technical Spec
{story technical_spec}

## Design Bundle
{relevant design_bundle sections}
```

**Backend extension** — `GET /phase3/story-context/{story_id}` returns all fields:
```json
{
  "gherkin": "...",
  "technical_spec": "...",
  "project_concept": "...",
  "tech_stack": "...",
  "design_bundle": "..."
}
```
`Phase3Service.get_story_context()` calls:
- `context_manager.get_story_gherkin(story_id)`
- `context_manager.get_story_technical_spec(story_id)` — endpoints section (auth/in/out)
- `context_manager.get_project_concept()`
- `context_manager.get_tech_stack_content()`
- `context_manager.read_context_file("design-bundle.md")` — returns UX Brief + Endpoints + Data Model (3 sections)

**Download function** (`phase3-workflow.tsx`):
```typescript
function downloadPack(
  taskSubject: string,
  packMarkdown: string,
  storyContext: StoryContext,  // all fields from /story-context
) {
  const appendix = buildContextAppendix(storyContext);
  const full = packMarkdown + "\n\n---\n\n# Context Appendix\n\n" + appendix;
  const slug = taskSubject.toLowerCase().replace(/\s+/g, "-");
  // Blob → anchor → click → revokeObjectURL (same pattern as phase2-workflow.tsx:69-86)
  a.download = `pack-${slug}.md`;
}
```

**"Export All Packs"** button (Stage D): single `.md` download with all task packs concatenated, context appendix appears once at the bottom. File name: `story-{id}-packs.md`.

**Copy AI Prompt**: extract `## AI Prompt` section from pack markdown, write to clipboard via `navigator.clipboard.writeText()`.

---

## GitHub Integration (secondary)

Enabled only when `GITHUB_TOKEN` and `GITHUB_REPO` env vars are set.
Frontend checks `GET /api/github/config` on Phase 3 mount; hides GitHub buttons if not configured.

**Create Issue**: POST to `https://api.github.com/repos/{GITHUB_REPO}/issues` with pack markdown as body. Response returns `html_url` shown as link.

**Create Branch**: POST to `https://api.github.com/repos/{GITHUB_REPO}/git/refs`, branching from repo default branch. Branch name: `feature/story-{story_id}-{slug}`.

**Repo context enrichment** (stretch goal): GET repo tree (`/git/trees/HEAD?recursive=1`), inject filtered file list into proposal generation prompt. Only include if user explicitly triggers "Add repo context".

---

## Tests

Add to `tests/test_backend_phase3.py` (new file, mirror `test_backend_phase2.py`):
- Eligible stories returns only `design_locked` entries
- Generate tasks returns valid task list structure
- Generate proposal returns non-empty markdown with required sections
- Save proposal writes file and updates story index
- Lock story transitions `phase_status` and `has_proposal`
- GitHub endpoints return 503 when not configured (graceful degradation)

---

## Verification

1. `pytest tests/test_backend_phase3.py` — all pass
2. `npm run lint` in `frontend/` — no errors
3. Manual flow: select design-locked story → generate tasks → generate 1 pack → download .md → verify sections present → lock → confirm `phase3_proposed` count increments in sidebar badge
4. If GitHub configured: create issue → verify URL returned; create branch → verify branch exists in repo

---

## Build Order

1. `src/ai_engine.py` — implement two stubs (core AI, no deps)
2. `backend/app/schemas/phase3.py` → `phase3_service.py` → `phase3.py` → register in `main.py`
3. `frontend/lib/api/taiga-direct.ts` — add `taigaCreateTask()`
4. `frontend/lib/api/phase3.ts` → `use-phase3.ts` → `phase3-store.ts` → `phase3-workflow.tsx` → update `page.tsx`
5. Tests
6. _(Optional)_ `backend/app/api/github.py` + frontend GitHub buttons
