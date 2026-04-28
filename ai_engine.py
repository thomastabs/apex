"""
ai_engine.py
LangChain AI engine backed exclusively by Anthropic (Claude).

Two-model split (configured via .env):
  AI_MODEL_FAST   — discovery, breakdown          (structured output)
  AI_MODEL_CODER  — architecture, propose, qa,    (code generation & debugging)
                    infra-delta, fix-bolt

Both fall back to the defaults below when the vars are not set.

Phase 1 pipeline (two-step):
  Step 1 — generate_nl_stories()    : Epic → NLStoryList (Natural Language, for human review)
  Step 2 — compile_gherkin_stories(): NL draft → GherkinStoryList (formal GL, on approval)

Context Isolation Rule (enforced in fix_bolt_diagnose):
  NEVER pass the full .ai-context.md to the fix-bolt AI call.
  Only pass: bug description + stack trace + isolated code snippet.
"""

import json
import os
import re
from collections.abc import Callable, Generator
from typing import Literal

from dotenv import load_dotenv
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

load_dotenv()

_DEFAULT_FAST  = "claude-haiku-4-5-20251001"
_DEFAULT_CODER = "claude-sonnet-4-6"

_llm_cache: dict = {}


def check_api_key() -> None:
    """Raise EnvironmentError if ANTHROPIC_API_KEY is not set."""
    if not os.getenv("ANTHROPIC_API_KEY"):
        raise EnvironmentError("ANTHROPIC_API_KEY is not set. Add it to your .env file.")


def get_fast_model() -> str:
    return os.getenv("AI_MODEL_FAST", _DEFAULT_FAST)


def get_coder_model() -> str:
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


def _invoke(system: str, human: str, model: str, max_tokens: int = 2048) -> str:
    llm = _get_llm(model, max_tokens)
    response = llm.invoke([SystemMessage(content=system), HumanMessage(content=human)])
    return response.content.strip()


def _invoke_structured_with_progress(
    system: str,
    human: str,
    model: str,
    schema,
    max_tokens: int = 2048,
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
    messages = [SystemMessage(content=system), HumanMessage(content=human)]
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
    except Exception:
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
    except Exception:
        pass

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
    response = llm.invoke([SystemMessage(content=augmented), HumanMessage(content=human)])
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
        result = schema.model_validate_json(_repair_truncated_json(content))
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
    for chunk in llm.stream(
        [SystemMessage(content=system), HumanMessage(content=human)]
    ):
        content = chunk.content
        if isinstance(content, str):
            yield content
        elif isinstance(content, list):
            for block in content:
                if isinstance(block, dict) and block.get("type") == "text":
                    yield block.get("text", "")


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
        description="Bolt size estimate — XS: under 2 hours, S: under 1 day"
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
    size: Literal["XS", "S"] = Field(description="Bolt size: XS or S")
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

_NL_GENERATION_SYSTEM = """\
You are a strict Product Owner operating within the Bolt Framework.
Your job is to decompose a high-level Epic into fractional User Stories of XS or S size.

Rules you MUST follow:
- Every story MUST be sized XS (< 2 hours) or S (< 1 day). Decompose aggressively.
- Scenarios MUST be written in plain Natural Language — no Gherkin keywords whatsoever.
- Write from the end-user perspective. Business behaviour only; never implementation details.
- Do NOT hallucinate requirements beyond what the Epic description implies.
- Cover the happy path AND the most significant failure/edge-case paths per story.
"""


def generate_nl_stories(
    epic_subject: str,
    epic_description: str,
    hint: str = "",
    project_concept: str = "",
    on_story: Callable[[int], None] | None = None,
) -> NLStoryList:
    human = ""
    if project_concept.strip():
        human += f"Project Concept:\n{project_concept.strip()}\n\n"
    human += f"Epic Title: {epic_subject}\n\nEpic Description:\n{epic_description}\n\n"
    if hint.strip():
        human += f"Team guidance / constraints:\n{hint.strip()}\n\n"
    human += "Decompose into fractional User Stories with Natural Language scenarios."
    return _invoke_structured_with_progress(
        _NL_GENERATION_SYSTEM, human, get_fast_model(), NLStoryList,
        on_item=on_story,
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

_GL_COMPILATION_SYSTEM = """\
You are a strict Gherkin Language (GL) compiler operating within the Bolt Framework.
Your ONLY job is to take a human-reviewed Natural Language story draft and compile it
into formal, machine-parseable Gherkin acceptance criteria.

Rules you MUST follow:
- Compile EVERY story and scenario present in the draft. Do NOT add or omit scope.
- Every scenario MUST have at least one Given step, one When step, and one Then step.
- Multiple steps per clause are fine — represent them as separate list items.
- Business logic only. No implementation details in the steps.
- The output must be 100% structurally consistent and parseable — no free-text additions.
- Story titles MUST be short (4–7 words), noun-phrase, title case. NEVER use "As a ..." format.
"""


def compile_gherkin_stories(
    nl_draft: str,
    on_story: Callable[[int], None] | None = None,
) -> GherkinStoryList:
    human = (
        f"Natural Language Draft (human-reviewed):\n\n{nl_draft}\n\n"
        "Compile every story and scenario into formal Gherkin Language."
    )
    return _invoke_structured_with_progress(
        _GL_COMPILATION_SYSTEM, human, get_fast_model(), GherkinStoryList,
        max_tokens=4096, on_item=on_story,
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
# 2. Design Phase — Systems Architect persona
# ---------------------------------------------------------------------------

_ARCHITECTURE_SYSTEM = """\
You are a Senior Systems Architect operating within the Bolt Framework.
Your job is to generate a formal technical contract that strictly satisfies the
provided Gherkin Acceptance Criteria — nothing more, nothing less.

Rules you MUST follow:
- Produce a formal OpenAPI 3.0 YAML specification OR a DB schema (or both if required).
- Every endpoint or schema field MUST be directly traceable to a Gherkin scenario.
- Do NOT add endpoints or fields not implied by the Gherkin.
- Output ONLY the raw YAML/schema. No preamble, no explanations outside of YAML comments.
"""


def generate_architecture(story_subject: str, gherkin: str) -> str:
    human = (
        f"User Story: {story_subject}\n\n"
        f"Locked Gherkin Acceptance Criteria:\n{gherkin}\n\n"
        "Generate the formal OpenAPI 3.0 YAML specification and/or database schema."
    )
    return _invoke(_ARCHITECTURE_SYSTEM, human, get_coder_model(), max_tokens=4096)


# ---------------------------------------------------------------------------
# 3a. Implementation Phase — Task Breakdown (Tech Lead persona)
# ---------------------------------------------------------------------------

_BREAKDOWN_SYSTEM = """\
You are a Tech Lead operating within the Bolt Framework.
Your job is to decompose a User Story into a sequential list of granular, executable
technical tasks for developers to execute during Bolts.

Rules you MUST follow:
- Each task must be atomic: one developer, one Bolt, one clear outcome.
- Tasks MUST be ordered by execution dependency (no circular dependencies).
- Reference the OpenAPI spec or DB schema where relevant.
- Flag any task as [HIGH RISK] if it touches auth, data migrations, or external APIs.
- Output a numbered list. Each item: Task title | Short description | Risk level.
- No preamble, no markdown beyond the list.
"""


def generate_tasks(story_subject: str, gherkin: str, technical_spec: str) -> str:
    human = (
        f"User Story: {story_subject}\n\n"
        f"Gherkin Acceptance Criteria:\n{gherkin}\n\n"
        f"Technical Spec (OpenAPI/DB Schema):\n{technical_spec}\n\n"
        "Generate the sequential task breakdown for the Bolt Backlog."
    )
    return _invoke(_BREAKDOWN_SYSTEM, human, get_fast_model(), max_tokens=2048)


# ---------------------------------------------------------------------------
# 3b. Implementation Phase — Coding Proposal (Senior Developer persona)
# ---------------------------------------------------------------------------

_PROPOSAL_SYSTEM = """\
You are a Senior Developer operating within the Bolt Framework.
Your job is to produce a precise, step-by-step coding implementation plan for a
specific technical task. This plan will guide a developer and constrain AI code
generation during the Bolt execution.

Rules you MUST follow:
- The plan must be anchored to the provided Gherkin and Technical Spec — no scope creep.
- List exact files to create or modify, function signatures, and data flow.
- Include the Consistency Factor: a set of unit test cases (inputs/outputs) that will
  mathematically constrain the AI code generation. Do NOT write test code — just define
  the test cases as assertions in plain English.
- Output in structured Markdown: ## Task, ## Context, ## Implementation Steps, ## Consistency Factor.
"""


def generate_coding_proposal(
    task_subject: str,
    task_description: str,
    gherkin: str,
    technical_spec: str,
) -> str:
    human = (
        f"Task: {task_subject}\n\n"
        f"Task Description: {task_description}\n\n"
        f"Gherkin Acceptance Criteria:\n{gherkin}\n\n"
        f"Technical Spec:\n{technical_spec}\n\n"
        "Generate the detailed coding proposal with Consistency Factor."
    )
    return _invoke(_PROPOSAL_SYSTEM, human, get_coder_model(), max_tokens=4096)


# ---------------------------------------------------------------------------
# 4. Testing Phase — QA persona
# ---------------------------------------------------------------------------

_QA_SYSTEM = """\
You are a strict QA Engineer operating within the Bolt Framework.
Your job is to generate end-to-end BDD test scripts based EXCLUSIVELY on the
provided Gherkin Acceptance Criteria.

Rules you MUST follow:
- Generate tests ONLY for the provided Gherkin scenarios. No hallucinated happy paths.
- Use Cypress (JavaScript) syntax for frontend interactions or Pytest + BDD for APIs.
- Cover ALL Given/When/Then branches in the Gherkin, including edge cases and failure paths.
- Do NOT add test cases for scenarios not present in the Gherkin.
- Output ONLY the raw test code. No preamble.
"""


def generate_bdd_tests(story_subject: str, gherkin: str) -> str:
    human = (
        f"User Story: {story_subject}\n\n"
        f"Locked Gherkin Acceptance Criteria:\n{gherkin}\n\n"
        "Generate the complete BDD test suite. No hallucinated scenarios."
    )
    return _invoke(_QA_SYSTEM, human, get_coder_model(), max_tokens=4096)


# ---------------------------------------------------------------------------
# 5. Deployment Phase — DevOps persona
# ---------------------------------------------------------------------------

_INFRA_SYSTEM = """\
You are a Senior DevOps Engineer operating within the Bolt Framework.
Your job is to analyze a completed User Story's technical specification and determine
whether any infrastructure changes are required for deployment.

Rules you MUST follow:
- Answer the single question: does this feature require new infrastructure, updated
  environment variables, or modified deployment scripts?
- If NO: output exactly "INFRA_DELTA: NONE" followed by a one-sentence justification.
- If YES: output "INFRA_DELTA: REQUIRED" followed by a complete Terraform HCL or
  CloudFormation YAML draft covering only the required changes.
- Do NOT generate infrastructure for things already covered by existing config.
"""


def generate_infra_delta(story_subject: str, technical_spec: str) -> str:
    human = (
        f"User Story: {story_subject}\n\n"
        f"Technical Spec:\n{technical_spec}\n\n"
        "Analyze infrastructure requirements for this deployment."
    )
    return _invoke(_INFRA_SYSTEM, human, get_coder_model(), max_tokens=4096)


# ---------------------------------------------------------------------------
# 6. Maintenance Phase — Context Isolation Rule
# ---------------------------------------------------------------------------

_FIX_BOLT_SYSTEM = """\
You are a Senior Debugging Engineer operating under strict context isolation.

CONTEXT ISOLATION RULE: You have been given ONLY the bug report and the isolated code snippet.
You do NOT have access to the full codebase or the full .ai-context.md file.
This is intentional — loading full context causes architectural hallucinations.

Rules you MUST follow:
- Diagnose the root cause using ONLY the provided bug description, stack trace, and code snippet.
- Propose a minimal, surgical patch that resolves ONLY this specific bug.
- Do NOT refactor unrelated code. Do NOT expand scope.
- Output in structured Markdown:
  ## Root Cause (2-3 sentences max)
  ## Patch (code block with the minimal fix)
  ## Vaccine Summary (one-line description for the permanent vaccine record)
"""


def fix_bolt_diagnose(
    issue_subject: str,
    issue_description: str,
    stack_trace: str,
    code_snippet: str,
) -> str:
    human = (
        f"Bug Report: {issue_subject}\n\n"
        f"Issue Description:\n{issue_description}\n\n"
        f"Stack Trace / Error:\n{stack_trace if stack_trace else '(no stack trace provided)'}\n\n"
        f"Isolated Code Snippet:\n{code_snippet if code_snippet else '(no snippet provided)'}\n\n"
        "Diagnose the root cause and provide the minimal patch."
    )
    return _invoke(_FIX_BOLT_SYSTEM, human, get_coder_model(), max_tokens=4096)
