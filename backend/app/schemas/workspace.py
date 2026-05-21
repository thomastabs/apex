"""Schemas for shell/sidebar workspace endpoints."""

from pydantic import BaseModel, Field, field_validator


class MeResponse(BaseModel):
    id: int | None = None
    username: str = ""
    full_name: str = ""
    email: str = ""


class LoginRequest(BaseModel):
    username: str
    password: str

    @field_validator("username", "password")
    @classmethod
    def not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("must not be empty")
        return v


class LoginResponse(BaseModel):
    auth_token: str
    me: MeResponse


class ProjectSchema(BaseModel):
    id: int
    name: str
    slug: str | None = None
    description: str = ""


class CreateProjectRequest(BaseModel):
    name: str
    description: str = ""

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("must not be empty")
        return v


class StorySchema(BaseModel):
    id: int
    ref: int
    subject: str
    description: str = ""
    version: int | None = None
    status: int | None = None
    tags: list[str] = Field(default_factory=list)
    epic_id: int | None = None
    epic_subject: str = ""


class EpicWithStoriesSchema(BaseModel):
    id: int
    ref: int
    subject: str
    description: str = ""
    version: int | None = None
    tags: list[str] = Field(default_factory=list)
    stories: list[StorySchema] = Field(default_factory=list)


class CreateEpicRequest(BaseModel):
    subject: str
    description: str = ""
    tags: list[str] = Field(default_factory=list)

    @field_validator("subject")
    @classmethod
    def subject_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("must not be empty")
        return v


class CreateStoryRequest(BaseModel):
    subject: str
    description: str = ""
    epic_id: int
    tags: list[str] = Field(default_factory=list)
    status_id: int | None = None

    @field_validator("subject")
    @classmethod
    def subject_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("must not be empty")
        return v


class ContextFileSchema(BaseModel):
    filename: str
    label: str
    content: str
    chars: int


class ContextFilesResponse(BaseModel):
    files: list[ContextFileSchema]
    total_chars: int


class UpdateContextFileRequest(BaseModel):
    content: str


class MembershipSchema(BaseModel):
    id: int
    user: int | None = None
    username: str = ""
    full_name: str = ""
    email: str = ""
    role: int | None = None
    role_name: str = ""
    is_owner: bool = False


class RoleSchema(BaseModel):
    id: int
    name: str


class UsersResponse(BaseModel):
    memberships: list[MembershipSchema] = Field(default_factory=list)
    roles: list[RoleSchema] = Field(default_factory=list)


class InviteMemberRequest(BaseModel):
    username_or_email: str
    role_id: int


class UpdateEpicRequest(BaseModel):
    version: int
    subject: str | None = None
    description: str | None = None
    tags: list[str] | None = None


class UpdateStoryRequest(BaseModel):
    version: int
    subject: str | None = None
    description: str | None = None
    tags: list[str] | None = None


class UpdateMemberRoleRequest(BaseModel):
    role_id: int


class EpicSchema(BaseModel):
    id: int
    ref: int
    subject: str
    description: str = ""
    version: int | None = None
    tags: list[str] = Field(default_factory=list)


class StoryStatusSchema(BaseModel):
    id: int
    name: str
    color: str = ""
    is_closed: bool = False


class OkResponse(BaseModel):
    ok: bool = True


class DeleteEpicResponse(BaseModel):
    ok: bool = True
    stories_deleted: int = 0
    story_failures: list[int] = Field(default_factory=list)


class ConfigResponse(BaseModel):
    project_id: int | None = None
    taiga_web_url: str = ""


class AiConfigModel(BaseModel):
    id: str
    label: str
    context_window: int = 0


class AiConfigResponse(BaseModel):
    fast_model: str
    coder_model: str
    available_models: list[AiConfigModel] = Field(default_factory=list)


class StoryIndexStatsResponse(BaseModel):
    total: int = 0
    phase2_designed: int = 0
    phase3_proposed: int = 0
    phase4_tested: int = 0
    phase5_deployed: int = 0
