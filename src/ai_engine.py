"""
ai_engine.py
LangChain AI engine backed exclusively by Anthropic (Claude).

Two-model split (configured via .env):
  AI_MODEL_FAST   — discovery, breakdown          (structured output)
  AI_MODEL_CODER  — architecture, propose, qa,    (code generation & debugging)
                    infra-delta, fix-apex

Both fall back to the defaults below when the vars are not set.

Phase 1 pipeline (two-step):
  Step 1 — generate_nl_stories()    : Epic → NLStoryList (Natural Language, for human review)
  Step 2 — compile_gherkin_stories(): NL draft → GherkinStoryList (formal GL, on approval)

Context Isolation Rule (enforced in fix_bolt_diagnose):
  NEVER pass the full .ai-context.md to the fix-apex AI call.
  Only pass: bug description + stack trace + isolated code snippet.
"""

import json
import logging
import os
import re
import time
from collections.abc import Callable, Generator
from typing import Literal

from dotenv import load_dotenv
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

# LangSmith tracing is enabled automatically when LANGCHAIN_TRACING_V2=true
# and LANGCHAIN_API_KEY are set in the environment — no code changes needed.

load_dotenv()

_DEFAULT_FAST  = "claude-haiku-4-5-20251001"
_DEFAULT_CODER = "claude-sonnet-4-6"


# ---------------------------------------------------------------------------
# Typed error classes
# ---------------------------------------------------------------------------

class AIError(Exception):
    """Base class for AI engine errors."""

class AIRateLimitError(AIError):
    """Rate-limit or quota error from the AI API (HTTP 429 / overloaded)."""

class AIValidationError(AIError):
    """Structured output failed schema validation after all repair attempts."""

class AITimeoutError(AIError):
    """AI API call timed out."""


_logger = logging.getLogger("apex.ai_engine")
_llm_cache: dict = {}


def _reclassify_llm_exc(exc: Exception, *, reraise_unrecognized: bool = True) -> None:
    """Re-raise a LangChain/requests exception as a typed AIError subclass.

    Checks exception class names first (reliable), then falls back to
    message pattern matching (broad but catches vendored/wrapped errors).
    When reraise_unrecognized=False, non-fatal streaming errors are silently
    swallowed so the caller can fall through to the next invocation tier.
    """
    exc_type = type(exc).__name__
    if exc_type in ("RateLimitError", "OverloadedError"):
        raise AIRateLimitError(str(exc)) from exc
    if exc_type in ("APITimeoutError", "Timeout", "ReadTimeout", "ConnectTimeout"):
        raise AITimeoutError(str(exc)) from exc
    msg = str(exc).lower()
    if any(k in msg for k in ("429", "rate_limit", "rate limit", "overloaded", "quota")):
        raise AIRateLimitError(str(exc)) from exc
    if "timeout" in msg or "timed out" in msg:
        raise AITimeoutError(str(exc)) from exc
    if reraise_unrecognized:
        raise exc


def check_api_key() -> None:
    """Raise EnvironmentError if ANTHROPIC_API_KEY is not set."""
    if not os.getenv("ANTHROPIC_API_KEY"):
        raise EnvironmentError("ANTHROPIC_API_KEY is not set. Add it to your .env file.")


AVAILABLE_MODELS: list[dict] = [
    {"id": "claude-haiku-4-5-20251001", "label": "Claude Haiku 4.5", "role": "Fast"},
    {"id": "claude-sonnet-4-6",         "label": "Claude Sonnet 4.6", "role": "Smart"},
]


def get_fast_model() -> str:
    try:
        from src.context_manager import load_config  # lazy to avoid circular at module level
        cfg = load_config()
        if cfg.get("ai_model_fast"):
            return cfg["ai_model_fast"]
    except Exception:
        pass
    return os.getenv("AI_MODEL_FAST", _DEFAULT_FAST)


def get_coder_model() -> str:
    try:
        from src.context_manager import load_config
        cfg = load_config()
        if cfg.get("ai_model_coder"):
            return cfg["ai_model_coder"]
    except Exception:
        pass
    return os.getenv("AI_MODEL_CODER", _DEFAULT_CODER)


def _get_llm(model: str, max_tokens: int) -> ChatAnthropic:
    key = f"{model}:{max_tokens}"
    if key not in _llm_cache:
        check_api_key()
        _llm_cache[key] = ChatAnthropic(
            model=model,
            temperature=0.2,
            max_tokens=max_tokens,
            max_retries=3,
        )
    return _llm_cache[key]


def _make_messages(system: str, human: str) -> list:
    """Build [SystemMessage, HumanMessage] with Anthropic prompt caching on the system turn.

    cache_control ephemeral caches everything up to this breakpoint for 5 min.
    Anthropic only bills cache write on first call; cache hits cost ~10% of normal.
    Short system prompts (<1024 tokens) are silently skipped by the API — no harm.
    """
    return [
        SystemMessage(content=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}]),
        HumanMessage(content=human),
    ]


def _invoke(system: str, human: str, model: str, max_tokens: int = 2048) -> str:
    llm = _get_llm(model, max_tokens)
    t0 = time.monotonic()
    try:
        response = llm.invoke(_make_messages(system, human))
        _logger.info("ai_call model=%s tokens=%s duration_s=%.2f status=ok",
                     model, max_tokens, time.monotonic() - t0)
        return response.content.strip()
    except AIError:
        raise
    except Exception as exc:
        _logger.warning("ai_call model=%s tokens=%s duration_s=%.2f status=error error=%s",
                        model, max_tokens, time.monotonic() - t0, type(exc).__name__)
        _reclassify_llm_exc(exc)


def _invoke_structured_with_progress(
    system: str,
    human: str,
    model: str,
    schema,
    max_tokens: int = 4096,
    *,
    on_item: Callable[[int], None] | None = None,
    item_field: str = "stories",
):
    """Structured output with live progress updates.

    Three-tier fallback:
      1. Streaming with with_structured_output (progress callbacks fire here).
      2. Non-streaming chain.invoke (same chain, no progress).
      3. Raw JSON prompt + manual Pydantic validation (bypasses LangChain parsing).

    Tier 3 exists because langchain-anthropic 0.1.x passes the initial empty {}
    from Anthropic's content_block_start streaming event into Pydantic validation,
    which raises ValidationError in both streaming and invoke paths.
    """
    llm = _get_llm(model, max_tokens)
    chain = llm.with_structured_output(schema)
    messages = _make_messages(system, human)
    last = None
    seen = 0

    # Tier 1 — streaming
    try:
        for chunk in chain.stream(messages):
            last = chunk
            if on_item is not None:
                if isinstance(chunk, dict):
                    items = chunk.get(item_field) or []
                    n = sum(1 for item in items if isinstance(item, dict) and item)
                else:
                    items = getattr(chunk, item_field, None) or []
                    n = sum(1 for item in items if item is not None)
                if n > seen:
                    seen = n
                    on_item(n)
    except AIError:
        raise
    except Exception as exc:
        _reclassify_llm_exc(exc, reraise_unrecognized=False)
        last = None

    if isinstance(last, schema):
        return last

    # Tier 2 — non-streaming invoke
    try:
        result = chain.invoke(messages)
        if isinstance(result, schema):
            return result
        if isinstance(result, dict):
            return schema.model_validate(result)
    except AIError:
        raise
    except Exception as exc:
        _reclassify_llm_exc(exc, reraise_unrecognized=False)

    # Tier 3 — raw JSON fallback (bypasses with_structured_output entirely)
    return _invoke_json_fallback(
        system, human, model, schema, max_tokens,
        on_item=on_item, item_field=item_field,
    )


def _repair_truncated_json(content: str) -> str:
    """Close unclosed braces/brackets in a truncated JSON string."""
    s = content.rstrip().rstrip(",")
    # If we're mid-string, close the string first
    # Count unescaped double-quotes to detect open strings
    in_string = False
    escape_next = False
    for ch in s:
        if escape_next:
            escape_next = False
            continue
        if ch == "\\":
            escape_next = True
            continue
        if ch == '"':
            in_string = not in_string
    if in_string:
        s += '"'
    open_curly  = s.count("{") - s.count("}")
    open_square = s.count("[") - s.count("]")
    s += "]" * max(open_square, 0)
    s += "}" * max(open_curly,  0)
    return s


def _invoke_json_fallback(
    system: str,
    human: str,
    model: str,
    schema,
    max_tokens: int,
    *,
    on_item: Callable[[int], None] | None = None,
    item_field: str = "stories",
):
    """Ask the model for raw JSON and validate it with Pydantic directly."""
    schema_doc = json.dumps(schema.model_json_schema(), indent=2)
    augmented = (
        f"{system}\n\n"
        f"RESPONSE FORMAT: output ONLY a single valid JSON object — "
        f"no markdown, no code fences, no commentary.\n"
        f"The JSON must match this schema exactly:\n{schema_doc}"
    )
    # Add headroom so long responses don't get truncated mid-JSON.
    effective_tokens = max(max_tokens + 2048, 8192)
    llm = _get_llm(model, effective_tokens)
    _logger.warning(
        "ai_json_fallback model=%s tokens=%s — structured output failed, falling back to raw JSON",
        model, effective_tokens,
    )
    t0 = time.monotonic()
    try:
        response = llm.invoke(_make_messages(augmented, human))
        _logger.info("ai_json_fallback model=%s duration_s=%.2f status=ok", model, time.monotonic() - t0)
    except AIError:
        raise
    except Exception as exc:
        _logger.warning(
            "ai_json_fallback model=%s duration_s=%.2f status=error error=%s",
            model, time.monotonic() - t0, type(exc).__name__,
        )
        _reclassify_llm_exc(exc)
    content = response.content
    if isinstance(content, list):
        content = "".join(
            block.get("text", "") for block in content if isinstance(block, dict)
        )
    content = content.strip()
    # Strip markdown code fences if the model added them
    content = re.sub(r"^```(?:json)?\s*\n?", "", content)
    content = re.sub(r"\n?```\s*$", "", content)
    content = content.strip()
    try:
        result = schema.model_validate_json(content)
    except Exception:
        try:
            result = schema.model_validate_json(_repair_truncated_json(content))
        except Exception as exc:
            raise AIValidationError(
                f"Structured output failed validation after repair attempt: {exc}"
            ) from exc
    if on_item is not None:
        items = getattr(result, item_field, [])
        on_item(len(items))
    return result


def stream_text(
    system: str, human: str, model: str, max_tokens: int = 4096
) -> Generator[str, None, None]:
    """Yield text chunks from a streaming LLM call.

    Compatible with st.write_stream() — yields plain strings.
    Used by Phases 2-6 which produce raw text (not structured output).
    """
    llm = _get_llm(model, max_tokens)
    try:
        for chunk in llm.stream(_make_messages(system, human)):
            content = chunk.content
            if isinstance(content, str):
                yield content
            elif isinstance(content, list):
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "text":
                        yield block.get("text", "")
    except AIError:
        raise
    except Exception as exc:
        _logger.warning("ai_stream model=%s status=error error=%s", model, type(exc).__name__)
        _reclassify_llm_exc(exc)


# ---------------------------------------------------------------------------
# Pydantic schemas — Phase 1 structured outputs
# ---------------------------------------------------------------------------

class NLScenario(BaseModel):
    title: str = Field(description="Short scenario title (e.g. 'Successful login')")
    description: str = Field(
        description="Plain natural-language description of what the user does and what happens"
    )


class NLStory(BaseModel):
    title: str = Field(
        description="User Story title in 'As a <role>, I want <goal>, so that <benefit>' format"
    )
    size: Literal["XS", "S"] = Field(
        description="Apex size estimate — XS: under 2 hours, S: under 1 day"
    )
    scenarios: list[NLScenario] = Field(
        description="Natural-language scenarios covering happy path, edge cases, and failure paths"
    )


class NLStoryList(BaseModel):
    stories: list[NLStory] = Field(
        description="Complete list of fractional user stories decomposed from the Epic"
    )


class GherkinScenario(BaseModel):
    title: str = Field(description="Scenario title")
    given: list[str] = Field(
        description="Precondition steps — each item is one step text without the 'Given'/'And' keyword"
    )
    when: list[str] = Field(
        description="Action steps — each item is one step text without the 'When'/'And' keyword"
    )
    then: list[str] = Field(
        description="Outcome steps — each item is one step text without the 'Then'/'And' keyword"
    )


class GherkinStory(BaseModel):
    title: str = Field(
        description=(
            "Concise story title for Taiga — 4 to 7 words, title case, noun-phrase style. "
            "NEVER use 'As a ...' format. "
            "Example: 'Bait Consumption on Successful Cast Only'"
        )
    )
    size: Literal["XS", "S"] = Field(description="Apex size: XS or S")
    scenarios: list[GherkinScenario] = Field(
        description="Formally compiled Gherkin scenarios for this story"
    )


class GherkinStoryList(BaseModel):
    stories: list[GherkinStory] = Field(
        description="All compiled Gherkin stories, one per NL story in the draft"
    )


# ---------------------------------------------------------------------------
# Phase 1 · Step 1 — NL Story Generation (Product Owner persona)
# ---------------------------------------------------------------------------

_NL_GENERATION_VERSION = "1.1"
_NL_GENERATION_SYSTEM = """\
You are a strict Product Owner operating within the Apex Framework.
Your job is to decompose a high-level Epic into fractional User Stories of XS or S size.

Rules you MUST follow:
- Every story MUST be sized XS (< 2 hours) or S (< 1 day). Decompose aggressively.
- Scenarios MUST be written in plain Natural Language — no Gherkin keywords whatsoever.
- Write from the end-user perspective. Business behaviour only; never implementation details.
- Do NOT hallucinate requirements beyond what the Epic description implies.
- Cover the happy path AND the most significant failure/edge-case paths per story.
- Each story must cover exactly ONE coherent goal — no mixing of concerns.
- Aim for 2–4 scenarios per story: happy path + the most important failure/edge cases.

--- FEW-SHOT EXAMPLE ---

INPUT:
  Epic Title: Task Assignment
  Epic Description: Allow project members to assign tasks to specific teammates and reassign them when priorities shift.

CORRECT OUTPUT (3 stories):

  [XS] As a project member, I want to assign a task to a teammate, so that ownership is clear.
    Scenario: Assign to an active member
      The member opens a task, picks a teammate from the assignee list, and the task now shows that teammate's name as owner.
    Scenario: Assign to someone not on the project
      The member searches for a person who is not part of the project and cannot select them — only project members appear.
    ---

  [XS] As a project member, I want to reassign a task to a different teammate, so that workload can be balanced.
    Scenario: Successful reassignment
      The member changes the assignee on a task from one teammate to another and the task reflects the new owner immediately.
    Scenario: Reassign a task that has no current assignee
      The member opens an unassigned task and picks a teammate — the task gains an owner for the first time.
    ---

  [XS] As a project member, I want to unassign a task, so that it returns to the pool of unowned work.
    Scenario: Remove assignee from an assigned task
      The member removes the assignee from a task and the task shows as unassigned.
    Scenario: Attempt to unassign an already-unassigned task
      The member opens a task with no assignee and the unassign action is not available.
    ---

KEY RULES ILLUSTRATED:
- Each story covers exactly ONE action (assign / reassign / unassign) — not all three at once.
- Scenario descriptions are plain sentences — no Given/When/Then, no bullet points, no Gherkin keywords.
- All three stories are XS (well under 2 hours each).
- Each story has 2 scenarios: happy path + one significant failure/edge case.
--- END EXAMPLE ---
"""


def _build_nl_human(
    epic_subject: str,
    epic_description: str,
    hint: str = "",
    project_concept: str = "",
) -> str:
    parts: list[str] = []
    if project_concept.strip():
        parts.append(f"Project Concept:\n{project_concept.strip()}")
    parts.append(f"Epic Title: {epic_subject}\n\nEpic Description:\n{epic_description}")
    if hint.strip():
        parts.append(f"Team guidance / constraints:\n{hint.strip()}")
    parts.append("Decompose into fractional User Stories with Natural Language scenarios.")
    return "\n\n".join(parts)


def generate_nl_stories(
    epic_subject: str,
    epic_description: str,
    hint: str = "",
    project_concept: str = "",
    on_story: Callable[[int], None] | None = None,
) -> NLStoryList:
    human = _build_nl_human(epic_subject, epic_description, hint, project_concept)
    _logger.debug("generate_nl_stories prompt_version=%s", _NL_GENERATION_VERSION)
    return _invoke_structured_with_progress(
        _NL_GENERATION_SYSTEM, human, get_fast_model(), NLStoryList,
        max_tokens=8192, on_item=on_story,
    )


def format_nl_draft(story_list: NLStoryList) -> str:
    """Render an NLStoryList as human-readable text for the review editor."""
    lines = []
    for story in story_list.stories:
        lines.append(f"[{story.size}] {story.title}")
        lines.append("")
        for scenario in story.scenarios:
            lines.append(f"  Scenario: {scenario.title}")
            lines.append(f"  {scenario.description}")
            lines.append("")
        lines.append("---")
        lines.append("")
    return "\n".join(lines).rstrip()


# ---------------------------------------------------------------------------
# Phase 1 · Step 2 — Gherkin Compilation (GL Compiler persona)
# ---------------------------------------------------------------------------

_GL_COMPILATION_VERSION = "1.1"
_GL_COMPILATION_SYSTEM = """\
You are a strict Gherkin Language (GL) compiler operating within the Apex Framework.
Your ONLY job is to take a human-reviewed Natural Language story draft and compile it
into formal, machine-parseable Gherkin acceptance criteria.

Rules you MUST follow:
- Compile EVERY story and scenario present in the draft. Do NOT add or omit scope.
- Every scenario MUST have at least one Given step, one When step, and one Then step.
- Multiple steps per clause are fine — represent them as separate list items.
- Business logic only. No implementation details in the steps.
- The output must be 100% structurally consistent and parseable — no free-text additions.
- Story titles MUST be short (4–7 words), noun-phrase, title case. NEVER use "As a ..." format.
- Given steps: preconditions only (who the user is, what state the system is in).
- When steps: user's action in business terms — never UI mechanics ("submits the form" not "clicks the blue Submit button").
- Then steps: observable business outcomes only — never server internals ("the task shows the new owner" not "the database record is updated").

--- FEW-SHOT EXAMPLE ---

INPUT (Natural Language draft):

  [XS] As a project member, I want to assign a task to a teammate, so that ownership is clear.
    Scenario: Assign to an active member
      The member opens a task, picks a teammate from the assignee list, and the task now shows that teammate's name as owner.
    Scenario: Assign to someone not on the project
      The member searches for a person who is not part of the project and cannot select them — only project members appear.
    ---

CORRECT OUTPUT:

  title: "Task Assignment to Teammate"
  size: XS
  scenarios:
    - title: "Assign to an active member"
      given:
        - "the member is viewing an unassigned task"
        - "the task belongs to a project the member is part of"
      when:
        - "the member selects a teammate from the assignee list"
        - "the member confirms the assignment"
      then:
        - "the task displays the selected teammate as its owner"
        - "the assignment change is visible to all project members"

    - title: "Assign to someone not on the project"
      given:
        - "the member is viewing a task"
        - "there are people in the system who are not members of this project"
      when:
        - "the member searches for a person who is not part of the project"
      then:
        - "only current project members appear in the assignee list"
        - "the non-member cannot be selected"

KEY RULES ILLUSTRATED:
- Title "Task Assignment to Teammate" is noun-phrase, title case, 4 words. NOT "As a project member...".
- Given: who is where, in what state — no UI mechanics.
- When: business action ("selects a teammate", "confirms the assignment") — not "clicks button".
- Then: observable outcome ("task displays the selected teammate") — not "record saved to DB".
- Each step is a single atomic statement — one concept per list item.
--- END EXAMPLE ---
"""


def _build_gherkin_human(nl_draft: str) -> str:
    return (
        f"Natural Language Draft (human-reviewed):\n\n{nl_draft}\n\n"
        "Compile every story and scenario into formal Gherkin Language."
    )


def compile_gherkin_stories(
    nl_draft: str,
    on_story: Callable[[int], None] | None = None,
) -> GherkinStoryList:
    human = _build_gherkin_human(nl_draft)
    _logger.debug("compile_gherkin_stories prompt_version=%s", _GL_COMPILATION_VERSION)
    return _invoke_structured_with_progress(
        _GL_COMPILATION_SYSTEM, human, get_fast_model(), GherkinStoryList,
        max_tokens=8192, on_item=on_story,
    )


def format_gherkin_story(story: GherkinStory) -> str:
    """Render a single GherkinStory as a Gherkin feature block."""
    lines = [f"Feature: {story.title}", ""]
    for sc in story.scenarios:
        lines.append(f"  Scenario: {sc.title}")
        if sc.given:
            lines.append(f"    Given {sc.given[0]}")
            for step in sc.given[1:]:
                lines.append(f"    And {step}")
        if sc.when:
            lines.append(f"    When {sc.when[0]}")
            for step in sc.when[1:]:
                lines.append(f"    And {step}")
        if sc.then:
            lines.append(f"    Then {sc.then[0]}")
            for step in sc.then[1:]:
                lines.append(f"    And {step}")
        lines.append("")
    return "\n".join(lines).rstrip()


# Block-level keywords (always followed by colon, then optional whitespace/newline).
# Scenario Outline must precede Scenario so the longer match wins.
_GHERKIN_BLOCK_RE = re.compile(
    r"^(\s*)(Feature|Background|Scenario Outline|Scenario|Examples):([ \t]*)",
    re.MULTILINE,
)
# Step-level keywords (followed by a space, no colon).
_GHERKIN_STEP_RE = re.compile(
    r"^(\s*)(Given|When|Then|And|But)( )",
    re.MULTILINE,
)


def bold_gherkin_keywords(gherkin: str) -> str:
    """Wrap Gherkin keywords with Markdown bold markers for Taiga display."""
    result = _GHERKIN_BLOCK_RE.sub(
        lambda m: f"{m.group(1)}**{m.group(2)}:**{m.group(3)}", gherkin
    )
    return _GHERKIN_STEP_RE.sub(
        lambda m: f"{m.group(1)}**{m.group(2)}**{m.group(3)}", result
    )


# ---------------------------------------------------------------------------
# Phase 1 · Epic Suggestions — Product Owner persona
# ---------------------------------------------------------------------------

class EpicSuggestion(BaseModel):
    title: str = Field(description="Epic title — concise, 4-8 words, noun-phrase, title case")
    description: str = Field(
        description="2-3 sentence description of the epic's scope, user value, and key constraints"
    )


class EpicSuggestionList(BaseModel):
    epics: list[EpicSuggestion] = Field(description="Suggested epics for this project")


_EPIC_SUGGESTION_SYSTEM = """\
You are an experienced Product Owner operating within the Apex Framework.
Given a project concept, generate a list of well-scoped, high-level Epics that cover
the full product scope implied by the concept.

Rules you MUST follow:
- Each Epic represents a distinct feature area or user-facing capability.
- Epic titles must be concise (4-8 words), noun-phrase style, title case.
- Epic descriptions must be 2-3 sentences covering scope, user value, and any key constraints.
- Do NOT hallucinate capabilities beyond what the project concept implies.
- Suggest between 5 and 10 epics — enough to cover the product without being exhaustive.
"""


def suggest_epics(
    project_concept: str,
    hint: str = "",
) -> EpicSuggestionList:
    human = f"Project Concept:\n{project_concept.strip()}\n\n"
    if hint.strip():
        human += f"Focus / constraints:\n{hint.strip()}\n\n"
    human += "Suggest a complete set of high-level Epics for this project."
    return _invoke_structured_with_progress(
        _EPIC_SUGGESTION_SYSTEM, human, get_fast_model(), EpicSuggestionList,
        max_tokens=2048, item_field="epics",
    )


# ---------------------------------------------------------------------------
# Phase 2 Pydantic schemas
# ---------------------------------------------------------------------------

class ArchAlternative(BaseModel):
    name: str = Field(description="Short stack name, e.g. 'FastAPI + React + PostgreSQL'")
    description: str = Field(description="2-3 sentence rationale for this choice")
    trade_offs: str = Field(description="Pros and cons as markdown bullet points")


class ArchAlternativeList(BaseModel):
    alternatives: list[ArchAlternative] = Field(
        description="Exactly 5 ranked architectural alternatives, simplest to most scalable",
        min_length=5,
        max_length=5,
    )


class Phase2DesignResult(BaseModel):
    wireframes: str = Field(
        description="ASCII screen mockups for each screen/view required by the epic stories"
    )
    user_flow: str = Field(
        description="Valid Mermaid flowchart TD diagram showing the complete user flow across all stories"
    )
    component_tree: str = Field(
        default="",
        description="Indented text-based component/module hierarchy for the epic",
    )
    tech_spec: str = Field(
        default="",
        description="OpenAPI 3.0 YAML specification and/or DB schema DDL for all stories in the epic",
    )


# ---------------------------------------------------------------------------
# Phase 2 · Stage A — Tech Stack Alternatives (Solutions Architect persona)
# ---------------------------------------------------------------------------

_TECH_STACK_SYSTEM = """\
You are a Senior Solutions Architect operating within the Apex Framework.
Based on the FULL scope of ALL project stories below and the project context,
produce EXACTLY 5 ranked architectural alternatives.

Rules you MUST follow:
- Each alternative must be internally self-consistent (no incompatible layer combinations).
- Rank from Option 1 (simplest/fastest to build) to Option 3 (most scalable/enterprise-grade).
- Each option must include: the tech stack name, a 2-3 sentence rationale, and honest trade-offs.
- This suggestion will be locked for the ENTIRE project — do not over-engineer.
- Consider ALL stories together, not just one feature area.
- Keep your response professional and formal — no emojis, no casual language.
"""


def suggest_tech_stack(
    all_stories: list[dict],
    context: str,
    hint: str = "",
) -> list[dict]:
    """Return 5 ranked architectural alternatives for the full project scope.

    all_stories: [{"epic_title": str, "title": str, "gherkin": str}, ...]
    context: full Memory Bank content (Project Concept + Architecture Principles)
    hint: optional free-text guidance from the Tech Lead
    Returns: [{"name": str, "description": str, "trade_offs": str}, ...]
    """
    grouped: dict[str, list[str]] = {}
    for s in all_stories:
        epic = s.get("epic_title", "General")
        grouped.setdefault(epic, []).append(f"- {s.get('title', '')}")
    human_parts = [f"Project Context:\n{context.strip()}\n\nAll Project Stories:"]
    for epic, stories in grouped.items():
        human_parts.append(f"\n### {epic}")
        human_parts.extend(stories)
    if hint and hint.strip():
        human_parts.append(f"\nTech Lead Guidance:\n{hint.strip()}")
    human = "\n".join(human_parts)
    result = _invoke_structured_with_progress(
        _TECH_STACK_SYSTEM, human, get_coder_model(), ArchAlternativeList,
        max_tokens=4096, item_field="alternatives",
    )
    return [alt.model_dump() for alt in result.alternatives]


# ---------------------------------------------------------------------------
# Phase 2 · Stage B — Epic Design Bundle (Architect + UX Lead persona)
# ---------------------------------------------------------------------------

_PHASE2_DESIGN_SYSTEM = """\
You are a Senior Full-Stack Architect and UX Lead operating within the Apex Framework.
Generate a complete design bundle for the epic described below.

**Memory Bank (binding constraints — DO NOT violate):**
{context}
{cross_epic_section}
Rules you MUST follow:
- wireframes: ASCII art mockups for every distinct screen or view required by the stories.
  Label each screen clearly. Show key UI elements (inputs, buttons, labels, navigation).
  Match the visual style and layout conventions of any existing wireframes shown above.
- user_flow: A valid Mermaid `flowchart TD` diagram (no other Mermaid type) showing the
  complete user journey across all stories in this epic. Every story must appear as a node.
  Where this epic's flows connect to screens from other epics, reference those node names.
- component_tree: An indented plain-text hierarchy of all frontend components and/or
  backend modules needed. Use 2-space indentation. No code, just names and brief labels.
  Do NOT re-declare components that already exist in the existing architecture above —
  reference them by name instead and add only genuinely new components.
- tech_spec: A full OpenAPI 3.0 YAML specification covering all API endpoints required by
  the stories, PLUS a DB schema DDL block. ONLY use technologies from ## Tech Stack.
  Every endpoint must be traceable to at least one Gherkin scenario.
"""


def generate_phase2_design(
    epic_title: str,
    stories: list[dict],
    context: str,
    cross_epic_context: str = "",
) -> dict:
    """Generate wireframes, user flow, component tree, and OpenAPI spec for an epic.

    stories: [{"story_id": int, "title": str, "gherkin": str}, ...]
    context: full Memory Bank including confirmed ## Tech Stack
    cross_epic_context: formatted block from get_other_epics_design_context() — empty for
        the first epic, populated for subsequent ones to enforce cross-epic consistency
    Returns: {"wireframes": str, "user_flow": str, "component_tree": str, "tech_spec": str}
    """
    cross_epic_section = (
        f"\n{cross_epic_context.strip()}\n"
        if cross_epic_context.strip()
        else ""
    )
    system = _PHASE2_DESIGN_SYSTEM.format(
        context=context.strip(),
        cross_epic_section=cross_epic_section,
    )
    story_parts = [f"Epic: {epic_title}\n\nStories:"]
    for s in stories:
        story_parts.append(
            f"\n### Story {s.get('story_id', '')}: {s.get('title', '')}\n"
            f"{s.get('gherkin', '').strip()}"
        )
    human = "\n".join(story_parts)
    result = _invoke_structured_with_progress(
        system, human, get_coder_model(), Phase2DesignResult,
        max_tokens=20000, item_field="wireframes",
    )
    return result.model_dump()


# ---------------------------------------------------------------------------
# 3. Implementation Phase — Phase 3 (not yet implemented)
# ---------------------------------------------------------------------------

# TODO: generate_tasks(story_subject, gherkin, technical_spec) -> str
#   Tech Lead persona. Decompose story into sequential atomic tasks for the Apex Backlog.
#   Output: numbered list — Task title | Short description | [HIGH RISK] flag.
#   Use get_fast_model().

# TODO: generate_coding_proposal(task_subject, task_description, gherkin, technical_spec) -> str
#   Senior Developer persona. Step-by-step coding plan + Consistency Factor (test assertions).
#   Output: structured Markdown — ## Task, ## Context, ## Implementation Steps, ## Consistency Factor.
#   Use get_coder_model().


# ---------------------------------------------------------------------------
# 4. Testing Phase — Phase 4 (not yet implemented)
# ---------------------------------------------------------------------------

# TODO: generate_bdd_tests(story_subject, gherkin) -> str
#   QA Engineer persona. End-to-end BDD test scripts from Gherkin only — no hallucinated scenarios.
#   Cypress (JS) for frontend, Pytest+BDD for APIs.
#   Use get_coder_model().


# ---------------------------------------------------------------------------
# 5. Deployment Phase — Phase 5 (not yet implemented)
# ---------------------------------------------------------------------------

# TODO: generate_infra_delta(story_subject, technical_spec) -> str
#   DevOps persona. Determine if feature needs new infra, env vars, or deploy script changes.
#   Output: "INFRA_DELTA: NONE <justification>" or "INFRA_DELTA: REQUIRED <Terraform HCL / CF YAML>".
#   Use get_coder_model().


# ---------------------------------------------------------------------------
# 6. Maintenance Phase — Phase 6 (not yet implemented)
# ---------------------------------------------------------------------------

# TODO: fix_bolt_diagnose(issue_subject, issue_description, stack_trace, code_snippet) -> str
#   Senior Debugging Engineer under Context Isolation Rule — ONLY bug + stack trace + snippet.
#   Output: ## Root Cause, ## Patch, ## Vaccine Summary.
#   Use get_coder_model().
