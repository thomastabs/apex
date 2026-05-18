"""Schemas for shell/sidebar workspace endpoints."""

from pydantic import BaseModel, Field


class MeResponse(BaseModel):
    id: int | None = None
    username: str = ""
    full_name: str = ""
    email: str = ""


class LoginRequest(BaseModel):
    username: str
    password: str


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


class StorySchema(BaseModel):
    id: int
    ref: int
    subject: str
    description: str = ""
    version: int | None = None
    status: int | None = None
    tags: list[str] = Field(default_factory=list)
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


class CreateStoryRequest(BaseModel):
    subject: str
    description: str = ""
    epic_id: int


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
