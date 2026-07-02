export type RequestContext = {
  taigaToken: string;
  projectId: number;
  taigaApiUrl?: string;
  pmTool?: "taiga" | "jira";
  pmProjectId?: string;
};

export type AuthContext = {
  taigaToken: string;
  taigaApiUrl?: string;
  pmTool?: "taiga" | "jira";
};

export type Me = {
  id?: number | null;
  username: string;
  full_name: string;
  email: string;
};

export type Project = {
  id: number;
  name: string;
  slug?: string | null;
  description: string;
};

export type Epic = {
  id: number;
  ref: number;
  subject: string;
  description: string;
  version?: number | null;
  tags: string[];
};

export type Story = {
  id: number;
  ref: number;
  subject: string;
  description: string;
  version?: number | null;
  status?: number | string | null;
  tags: string[];
  epic_id?: number | null;
  epic_subject: string;
};

export type EpicWithStories = Epic & {
  stories: Story[];
};

export type ContextFile = {
  filename: string;
  label: string;
  content: string;
  chars: number;
  last_modified?: string | null;
  version?: string;
};

export type SpecDriftInfo = {
  amended: boolean;
  filename: string;
  affected_story_ids: number[];
  note: string;
};

export type ContextFilesResponse = {
  files: ContextFile[];
  total_chars: number;
  drift?: SpecDriftInfo | null;
};

export type Membership = {
  id: number;
  user?: number | null;
  username: string;
  full_name: string;
  email: string;
  role?: number | null;
  role_name: string;
  is_owner: boolean;
};

export type Role = {
  id: number;
  name: string;
};

export type UsersResponse = {
  memberships: Membership[];
  roles: Role[];
};

export type EpicSuggestion = {
  title: string;
  description: string;
};

export type RequirementGap = {
  title: string;
  kind: "missing_epic" | "incomplete_epic" | string;
  importance: "critical" | "high" | "medium" | "low" | string;
  rationale: string;
  suggested_stories: string[];
};

export type RequirementGapReport = {
  assessment: string;
  gaps: RequirementGap[];
};

export type CompiledStory = {
  title: string;
  size: string;
  gherkin: string;
};

export type Phase1GenerateNlStoriesRequest = {
  epic_subject: string;
  epic_description?: string;
  hint?: string;
  instructions?: string;
};

export type Phase1GenerateNlStoriesResponse = {
  nl_draft: string;
  story_count: number;
};

export type Phase1CompileGherkinResponse = {
  stories: CompiledStory[];
};

export type Phase1PushStoriesRequest = {
  epic_subject?: string;
  epic_description?: string;
  epic_id?: number | null;
  stories: CompiledStory[];
};

export type Phase1PushStoriesResponse = {
  ok: boolean;
  epic_id: number;
  count: number;
  story_ids: number[];
  story_urls?: string[];
  push_failures?: Array<{ title: string; error: string }>;
};

export type TechStackStatus = {
  defined: boolean;
  tech_stack: string | null;
};

export type ArchitectureAlternative = {
  name: string;
  description: string;
  trade_offs: string;
};

export type ProposeTechStackRequest = {
  hint?: string;
};

export type ProposeTechStackResponse = {
  alternatives: ArchitectureAlternative[];
};

export type LockTechStackRequest = {
  tech_stack: string;
};

export type DesignSectionKey = "ux_brief" | "endpoints" | "data_model";

export type DesignSectionResponse = {
  section: DesignSectionKey;
  content: string;
  story_ids: number[];
};

export type DesignBundle = {
  ux_brief: string;
  endpoints: string;
  data_model: string;
  story_ids: number[];
};

export type LockDesignRequest = {
  story_ids: number[];
  ux_brief: string;
  endpoints: string;
  data_model: string;
};

export type LockDesignResponse = {
  ok: boolean;
  story_ids: number[];
  taiga_failures?: Array<{ story_id: number; error: string }>;
};

export type DiagramField = {
  name: string;
  type: string;
  pk: boolean;
  fk: boolean;
};

export type DiagramNodeData = {
  label: string;
  fields: DiagramField[];
};

export type DiagramNode = {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: DiagramNodeData;
};

export type DiagramEdge = {
  id: string;
  source: string;
  target: string;
  label: string;
  animated: boolean;
};

export type DiagramResponse = {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
};

export type ScreenFlowNodeData = {
  label: string;
  description: string;
};

export type ScreenFlowNode = {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: ScreenFlowNodeData;
};

export type ScreenFlowEdge = {
  id: string;
  source: string;
  target: string;
  label: string;
  animated: boolean;
  data?: { kind?: string };  // kind: "cross_file" = inferred cross-file link (project mode)
};

export type ScreenFlowResponse = {
  nodes: ScreenFlowNode[];
  edges: ScreenFlowEdge[];
};

// ---------------------------------------------------------------------------
// Phase 3 — Implementation Assist
// ---------------------------------------------------------------------------

export type EffortEstimate = "XS" | "S" | "M" | "L" | "XL";

export type Phase3Task = {
  id: number;
  subject: string;
  description: string;
  effort_estimate: EffortEstimate;
  covered_scenarios: string[];
  predecessor_task_ids: number[];
  taiga_task_id?: number;
  pm_task_id?: string;
  pm_task_ref?: string | number;
};

export type Phase3StoryPreview = {
  story_id: number;
  title: string;
  epic_title: string;
  gherkin_preview: string;
  tech_spec_preview: string;
};

export type Phase3EligibleStoriesResponse = {
  stories: Phase3StoryPreview[];
};

export type Phase3StoryContext = {
  story_id: number;
  title: string;
  epic_title: string;
  gherkin: string;
  technical_spec: string;
  project_concept: string;
  tech_stack: string;
  design_bundle: string;
};

export type Phase3GenerateTasksResponse = {
  story_id: number;
  tasks: Phase3Task[];
};

export type Phase3GenerateProposalRequest = {
  story_id: number;
  task_id: number;
  task_subject: string;
  task_description: string;
  hint?: string;
  recent_commits_context?: string;
  all_tasks?: Array<{ id: number; subject: string; description: string }>;
};

export type Phase3GenerateProposalResponse = {
  proposal_md: string;
};

export type Phase3SaveProposalRequest = {
  story_id: number;
  task_id: number;
  proposal_md: string;
};

export type Phase3LockStoryRequest = {
  story_id: number;
  task_ids: number[];
};

export type DesignConflictRow = {
  story_id: number;
  title: string;
  reason: string;
  files: string[];
  endpoints: string[];
};

export type DesignConflictReport = {
  results: DesignConflictRow[];
  conflicted_ids: number[];
};

// ---------------------------------------------------------------------------
// Phase 4 — QA Assistant
// ---------------------------------------------------------------------------

export type Phase4StoryPreview = {
  story_id: number;
  title: string;
  epic_title: string;
  gherkin_preview: string;
  has_bdd: boolean;
  has_bug_report: boolean;
  is_regression_bypass: boolean;
};

export type Phase4EligibleStoriesResponse = {
  stories: Phase4StoryPreview[];
};

export type Phase4StoryContext = {
  story_id: number;
  title: string;
  epic_title: string;
  gherkin: string;
  technical_spec: string;
  tech_stack: string;
};

export type Phase4GenerateTestPlanResponse = {
  story_id: number;
  test_plan_md: string;
};

export type Phase4TestPlanResponse = {
  story_id: number;
  test_plan_md: string;
};

export type Phase4TestPlanListItem = {
  story_id: number;
  title: string;
  chars: number;
};

export type Phase4TestPlansResponse = {
  test_plans: Phase4TestPlanListItem[];
};

export type Phase4FailedScenario = {
  scenario_name: string;
  qa_notes: string;
};

export type Phase4GenerateBugReportRequest = {
  story_id: number;
  failed_scenarios: Phase4FailedScenario[];
};

export type Phase4GenerateBugReportResponse = {
  story_id: number;
  bug_report_md: string;
};

export type Phase4BugReportListItem = {
  story_id: number;
  title: string;
  chars: number;
};

export type Phase4BugReportsResponse = {
  bug_reports: Phase4BugReportListItem[];
};

export type Phase4BugReportResponse = {
  story_id: number;
  bug_report_md: string;
};

export type Phase4FixLogResponse = {
  fix_log_md: string;
};

export type Phase4ScenarioResultItem = {
  scenario: string;
  result: "pass" | "fail";
  notes?: string;
};

export type Phase4FailGateRequest = {
  story_id: number;
  bug_report_md: string;
  root_cause?: string;
  resolution_summary?: string;
  push_to_pm?: boolean;
  scenario_results?: Phase4ScenarioResultItem[];
};

// ---------------------------------------------------------------------------
// Phase 5 — Deployment Gate
// ---------------------------------------------------------------------------

export type Phase5StoryPreview = {
  story_id: number;
  title: string;
  epic_title: string;
  gherkin_preview: string;
  has_infra_delta: boolean;
  has_deploy_pack: boolean;
  deploy_bypass: boolean;
  fix_bolt_count: number;
};

export type Phase5EligibleStoriesResponse = {
  stories: Phase5StoryPreview[];
};

export type Phase5StoryContext = {
  story_id: number;
  title: string;
  epic_title: string;
  gherkin: string;
  technical_spec: string;
  tech_stack: string;
  github_context_synced: boolean;
  is_first_deployment: boolean;
  pipeline_detected: boolean;
  has_bug_report: boolean;
  fix_bolt_count: number;
};

export type InfraDeltaCategory = "env_var" | "migration" | "iac" | "ci_config" | "secret";

export type InfraDeltaItem = {
  category: InfraDeltaCategory;
  title: string;
  detail: string;
  risk: "low" | "high";
};

export type InfraDelta = {
  needs_infra_change: boolean;
  rationale: string;
  confidence: "low" | "medium" | "high";
  evidence: string;
  deltas: InfraDeltaItem[];
};

export type Phase5InfraDeltaResponse = {
  story_id: number;
  delta: InfraDelta;
};

export type Phase5DeployPackResponse = {
  story_id: number;
  deploy_pack_md: string;
};

export type DeployPackListItem = {
  story_id: number;
  title: string;
  chars: number;
};

export type Phase5DeployPacksResponse = {
  deploy_packs: DeployPackListItem[];
};

export type DeployPackEmphasis =
  | "zero_downtime"
  | "rollback_depth"
  | "secrets"
  | "db_safety"
  | "observability";

export type DeployPackOptions = {
  target_env: "" | "production" | "staging" | "both";
  iac_format: "" | "terraform" | "compose" | "kubernetes" | "bicep" | "shell";
  emphasis: DeployPackEmphasis[];
  instructions: string;
};

export type Phase5QaAttempt = {
  recorded_at: string;
  gate: "pass" | "fail";
  results: Array<{ scenario: string; result: "pass" | "fail"; notes?: string }>;
};

export type Phase5QaResultsResponse = {
  story_id: number;
  qa_results: { story_id: number; attempts: Phase5QaAttempt[] } | null;
};

export type TraceabilityGap =
  | "NO_COVERING_TASK"
  | "TASK_WITHOUT_PACK"
  | "NOT_TESTED"
  | "ORPHAN_COVERS";

export type VerificationScenarioRow = {
  scenario: string;
  tasks: number[];
  tasks_with_pack: number[];
  qa_result: "pass" | "fail" | "untested";
  gaps: string[];
};

export type VerificationMatrixPayload = {
  scenarios: VerificationScenarioRow[];
  summary: {
    total: number;
    covered: number;
    with_pack: number;
    tested: number;
    gap_count: number;
  };
  complete: boolean;
};

// ---------------------------------------------------------------------------
// Phase 6 — Spec↔Code Conformance (Traceability Explorer)
// ---------------------------------------------------------------------------

export type ConformanceEligibleStory = {
  story_id: number;
  title: string;
  epic_title: string;
  phase_status: string;
  has_conformance: boolean;
  score: number | null;
};

export type ConformanceEligibleStoriesResponse = {
  stories: ConformanceEligibleStory[];
};

export type EndpointConformance = {
  contract: string;
  status: "present" | "missing" | "mismatch" | "unknown";
  location: string;
  notes: string;
};

export type ScenarioConformance = {
  scenario: string;
  status: "tested" | "untested" | "partial" | "unknown";
  test_location: string;
  notes: string;
};

export type ConstraintConformance = {
  constraint_id: string;
  status: "addressed" | "not_found" | "unknown";
  evidence: string;
};

export type RowVerdict = {
  ref: string;
  kind: "endpoint" | "scenario" | "constraint";
  status: string;
  rationale: string;
  citation: string;
  agreement: "unanimous" | "split";
};

export type PanelMeta = {
  escalated: number;
  rows: RowVerdict[];
};

export type ConformanceReport = {
  story_id: number;
  title: string;
  epic_title: string;
  layer: string;
  score: number;
  summary: string;
  endpoints: EndpointConformance[];
  scenarios: ScenarioConformance[];
  constraints: ConstraintConformance[];
  generated_at: string;
  // Present only on adversarial-panel passes (layer === "panel").
  panel_meta?: PanelMeta | null;
};

export type WorsenedRow = {
  ref: string;
  kind: "endpoint" | "scenario";
  old_status: string;
  new_status: string;
};

export type ScanResultRow = {
  story_id: number;
  title: string;
  old_score: number | null;
  new_score: number;
  regressed: boolean;
  worsened_rows: WorsenedRow[];
};

export type ScanReport = {
  results: ScanResultRow[];
  regressed_ids: number[];
};

// Phase 6 Maintenance — Triage (F1) + Fix-Bolt & Severity Routing (F2)

export type MaintenanceItem = {
  id: number;
  source: "manual" | "github" | "taiga" | "jira" | "figma";
  ext_ref: string;
  subject: string;
  description: string;
  evidence: string;
  linked_story_id: number | null;
  classification: "unclassified" | "change_request" | "bug";
  status: "new" | "routed_to_discovery" | "diagnosed" | "fix_ready" | "resolved";
  diagnosis_md: string;
  fix_brief_md: string;
  lane: "fast" | "secure" | null;
  ai_rationale: { classify?: string; severity_hint?: string; risk?: string };
  created_at: string;
  updated_at: string;
};

export type MaintenanceItemsResponse = { items: MaintenanceItem[] };
export type SeveritySuggestion = { lane: "fast" | "secure"; rationale: string };
