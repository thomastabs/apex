export type RequestContext = {
  taigaToken: string;
  projectId: number;
  taigaApiUrl?: string;
};

export type AuthContext = {
  taigaToken: string;
  taigaApiUrl?: string;
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
  status?: number | null;
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
};

export type ContextFilesResponse = {
  files: ContextFile[];
  total_chars: number;
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

export type CompiledStory = {
  title: string;
  size: string;
  gherkin: string;
};

export type Phase1GenerateNlStoriesRequest = {
  epic_subject: string;
  epic_description?: string;
  hint?: string;
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

// ---------------------------------------------------------------------------
// Phase 3 — Implementation Assist
// ---------------------------------------------------------------------------

export type Phase3Task = {
  id: number;
  subject: string;
  description: string;
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
