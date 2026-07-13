"""AI operations used by the FastAPI backend."""

from src import ai_engine


class AiService:
    def suggest_epics(self, project_concept: str, hint: str) -> list[dict]:
        result = ai_engine.suggest_epics(project_concept, hint)
        return [
            {"title": epic.title, "description": epic.description}
            for epic in result.epics
        ]

    def analyze_requirement_gaps(
        self, project_concept: str, existing_epics: list[dict], hint: str = "",
    ) -> dict:
        """Gap-analyse current epics/stories vs the concept. Returns report dict."""
        result = ai_engine.analyze_requirement_gaps(project_concept, existing_epics, hint)
        return {
            "assessment": result.assessment,
            "gaps": [g.model_dump() for g in result.gaps],
        }

    def generate_nl_stories(
        self,
        epic_subject: str,
        epic_description: str,
        *,
        hint: str,
        project_concept: str,
        instructions: str = "",
        figma_context: str = "",
        images: list[dict] | None = None,
    ) -> tuple[str, int]:
        result = ai_engine.generate_nl_stories(
            epic_subject,
            epic_description,
            hint=hint,
            project_concept=project_concept,
            instructions=instructions,
            figma_context=figma_context,
            images=images,
        )
        return ai_engine.format_nl_draft(result), len(result.stories)

    def generate_stories_from_figma(
        self,
        frames: list[dict],
        flows: list[dict],
        *,
        project_concept: str,
        instructions: str = "",
        images: list[dict] | None = None,
    ) -> tuple[str, int]:
        result = ai_engine.generate_stories_from_figma(
            frames,
            flows,
            project_concept=project_concept,
            instructions=instructions,
            images=images,
        )
        return ai_engine.format_nl_draft(result), len(result.stories)

    def pick_alt_model(self, model: str) -> str | None:
        return ai_engine.pick_alt_model(model)

    def resolve_alt_model(self, primary_model: str, requested: str = "") -> str | None:
        return ai_engine.resolve_alt_model(primary_model, requested)

    def cross_check_nl_stories(
        self,
        epic_subject: str,
        epic_description: str,
        *,
        hint: str,
        project_concept: str,
        primary_model: str,
        alt_model: str,
    ) -> dict:
        """Generate stories with two models and diff their scenario sets (no AI in
        the diff). Returns {agreed, only_primary, only_alt}."""
        primary = ai_engine.generate_nl_stories(
            epic_subject, epic_description, hint=hint, project_concept=project_concept, model=primary_model)
        alt = ai_engine.generate_nl_stories(
            epic_subject, epic_description, hint=hint, project_concept=project_concept, model=alt_model)
        return ai_engine.diff_nl_story_scenarios(primary, alt)

    def generate_constraints(
        self,
        project_concept: str,
        tech_stack: str,
        all_stories: list[dict],
    ) -> tuple[list[dict], str]:
        """Return (structured constraints, rendered constraints.md markdown)."""
        result = ai_engine.generate_constraints(project_concept, tech_stack, all_stories)
        items = [c.model_dump() for c in result.constraints]
        return items, ai_engine.format_constraints(result)

    def layer_a_conformance(
        self,
        gherkin: str,
        technical_spec: str,
        github_context: str,
        constraints: str = "",
        runtime_spec: str = "",
    ) -> dict:
        """Deterministic Layer-A conformance baseline (no AI). Returns report dict."""
        return ai_engine.build_layer_a_report(
            gherkin, technical_spec, github_context, constraints, runtime_spec
        ).model_dump()

    def verify_conformance(
        self,
        story_subject: str,
        gherkin: str,
        technical_spec: str,
        github_context: str,
        constraints: str = "",
        tech_stack: str = "",
        precheck: dict | None = None,
    ) -> dict:
        """AI semantic spec↔code verification (Layer B). Returns report dict."""
        report = ai_engine.verify_spec_conformance(
            story_subject, gherkin, technical_spec, github_context,
            constraints=constraints, tech_stack=tech_stack, precheck=precheck,
        )
        return report.model_dump()

    def verify_conformance_panel(
        self,
        story_subject: str,
        gherkin: str,
        technical_spec: str,
        github_context: str,
        constraints: str = "",
        tech_stack: str = "",
        precheck: dict | None = None,
    ) -> dict:
        """Adversarial-panel spec↔code verification (Layer B+). Returns report dict."""
        report = ai_engine.verify_conformance_panel(
            story_subject, gherkin, technical_spec, github_context,
            constraints=constraints, tech_stack=tech_stack, precheck=precheck,
        )
        return report.model_dump()

    # ── Phase 6 maintenance ─────────────────────────────────────────────────

    def triage_feedback(self, subject: str, description: str, spec_excerpt: str = "") -> dict:
        r = ai_engine.triage_feedback(subject, description, spec_excerpt)
        return r.model_dump()

    def diagnose_bug(self, subject: str, description: str, evidence: str = "",
                     code_snippet: str = "", spec_excerpt: str = "") -> str:
        return ai_engine.diagnose_bug(subject, description, evidence, code_snippet, spec_excerpt)

    def fix_bolt_brief(self, diagnosis_md: str, spec_excerpt: str = "") -> str:
        patch = ai_engine.generate_fix_bolt_patch(diagnosis_md, spec_excerpt)
        return ai_engine.render_fix_bolt_brief(patch)

    def suggest_severity_lane(self, diagnosis_md: str, patch_scope: str = "") -> dict:
        return ai_engine.suggest_severity_lane(diagnosis_md, patch_scope).model_dump()

    def generate_clarifying_questions(
        self,
        epic_subject: str,
        epic_description: str,
        nl_draft: str,
        *,
        project_concept: str = "",
        hint: str = "",
    ) -> list[dict]:
        result = ai_engine.generate_clarifying_questions(
            epic_subject, epic_description, nl_draft,
            project_concept=project_concept, hint=hint,
        )
        return [q.model_dump() for q in result.questions]

    def compile_gherkin(self, nl_draft: str, clarifications: list[dict] | None = None) -> list[dict]:
        result = ai_engine.compile_gherkin_stories(nl_draft, clarifications)
        return [
            {
                "title": story.title,
                "size": story.size,
                "gherkin": ai_engine.format_gherkin_story(story),
                "assumptions": [
                    f"{sc.title}: {a}" for sc in story.scenarios for a in sc.assumptions
                ],
            }
            for story in result.stories
        ]

    def bold_gherkin_keywords(self, gherkin: str) -> str:
        return ai_engine.bold_gherkin_keywords(gherkin)

    def suggest_tech_stack(
        self,
        all_stories: list[dict],
        context: str,
        hint: str,
    ) -> list[dict]:
        return ai_engine.suggest_tech_stack(all_stories, context, hint)

    def generate_tasks(
        self,
        story_subject: str,
        gherkin: str,
        technical_spec: str,
        tech_stack: str = "",
        design_bundle: str = "",
        github_context: str = "",
        instructions: str = "",
        figma_context: str = "",
    ) -> list[dict]:
        result = ai_engine.generate_tasks(
            story_subject, gherkin, technical_spec,
            tech_stack=tech_stack, design_bundle=design_bundle, github_context=github_context,
            instructions=instructions, figma_context=figma_context,
        )
        return [
            {
                "id": t.id,
                "subject": t.subject,
                "description": t.description,
                "effort_estimate": t.effort_estimate,
                "covered_scenarios": t.covered_scenarios,
                "predecessor_task_ids": t.predecessor_task_ids,
            }
            for t in result.tasks
        ]

    def generate_proposal(
        self,
        task_subject: str,
        task_description: str,
        gherkin: str,
        technical_spec: str,
        tech_stack: str = "",
        design_bundle: str = "",
        story_ref: str = "",
        github_context: str = "",
        hint: str = "",
        recent_commits: str = "",
        other_tasks: list[dict] | None = None,
        sibling_packs: list[dict] | None = None,
        constraints: str = "",
        decisions: str = "",
        figma_context: str = "",
        images: list[dict] | None = None,
    ) -> str:
        return ai_engine.generate_coding_proposal(
            task_subject, task_description, gherkin, technical_spec,
            tech_stack=tech_stack, design_bundle=design_bundle, story_ref=story_ref,
            github_context=github_context, hint=hint, recent_commits=recent_commits,
            other_tasks=other_tasks or [],
            sibling_packs=sibling_packs or [],
            constraints=constraints,
            decisions=decisions,
            figma_context=figma_context,
            images=images,
        )

    def generate_er_diagram(self, data_model_md: str):
        return ai_engine.extract_er_diagram(data_model_md)

    def generate_screen_flow(self, ux_brief_md: str):
        return ai_engine.extract_screen_flow(ux_brief_md)

    def generate_design_system(self, ux_brief_md: str, instructions: str = ""):
        return ai_engine.extract_design_system(ux_brief_md, instructions=instructions)

    def generate_design_system_screen(
        self,
        ux_brief_md: str,
        *,
        colors: list[dict],
        typography: dict,
        navigation: dict,
        existing_screens: list[dict],
        screen_id: str | None = None,
        instructions: str = "",
    ):
        return ai_engine.extract_design_system_screen(
            ux_brief_md,
            colors=colors, typography=typography, navigation=navigation,
            existing_screens=existing_screens, screen_id=screen_id, instructions=instructions,
        )

    def generate_test_plan(
        self,
        story_subject: str,
        gherkin: str,
        technical_spec: str,
        tech_stack: str = "",
        developer_packs: list[dict] | None = None,
        constraints: str = "",
        instructions: str = "",
        emphasis: list[str] | None = None,
        figma_context: str = "",
        github_context: str = "",
    ) -> str:
        return ai_engine.generate_test_plan(
            story_subject, gherkin, technical_spec, tech_stack=tech_stack,
            developer_packs=developer_packs or [],
            constraints=constraints,
            instructions=instructions,
            emphasis=emphasis or [],
            figma_context=figma_context,
            github_context=github_context,
        )

    def generate_bug_report(
        self,
        story_subject: str,
        gherkin: str,
        technical_spec: str,
        failed_scenario: str,
        qa_notes: str,
    ) -> str:
        return ai_engine.generate_bug_report(
            story_subject, gherkin, technical_spec, failed_scenario, qa_notes,
        )

    def generate_edge_cases(self, scenario_text: str, technical_spec: str = "") -> str:
        return ai_engine.generate_edge_cases(scenario_text, technical_spec)

    def generate_infra_delta(
        self,
        story_subject: str,
        gherkin: str,
        technical_spec: str,
        tech_stack: str = "",
        github_context: str = "",
        is_first_deployment: bool = False,
        pipeline_detected: bool = False,
    ) -> dict:
        result = ai_engine.generate_infra_delta(
            story_subject, gherkin, technical_spec,
            tech_stack=tech_stack, github_context=github_context,
            is_first_deployment=is_first_deployment, pipeline_detected=pipeline_detected,
        )
        return result.model_dump()

    def generate_deploy_pack(
        self,
        story_subject: str,
        infra_delta_md: str,
        technical_spec: str,
        tech_stack: str = "",
        github_context: str = "",
        target_env: str = "",
        iac_format: str = "",
        emphasis: list[str] | None = None,
        instructions: str = "",
    ) -> str:
        return ai_engine.generate_deploy_pack(
            story_subject, infra_delta_md, technical_spec,
            tech_stack=tech_stack, github_context=github_context,
            target_env=target_env, iac_format=iac_format,
            emphasis=emphasis, instructions=instructions,
        )

    def revise_deploy_pack(
        self,
        current_pack_md: str,
        feedback: str,
        infra_delta_md: str = "",
    ) -> str:
        return ai_engine.revise_deploy_pack(
            current_pack_md, feedback, infra_delta_md=infra_delta_md,
        )

    def cross_check_tasks(
        self,
        story_subject: str,
        gherkin: str,
        technical_spec: str,
        *,
        tech_stack: str,
        design_bundle: str,
        github_context: str,
        primary_model: str,
        alt_model: str,
    ) -> dict:
        """Decompose tasks with two models and diff the task subjects (no AI diff)."""
        kw = dict(tech_stack=tech_stack, design_bundle=design_bundle, github_context=github_context)
        primary = ai_engine.generate_tasks(story_subject, gherkin, technical_spec, model=primary_model, **kw)
        alt = ai_engine.generate_tasks(story_subject, gherkin, technical_spec, model=alt_model, **kw)
        return ai_engine.diff_task_lists(primary, alt)

    def cross_check_endpoints(
        self,
        all_stories: list[dict],
        context: str,
        *,
        ux_brief: str,
        primary_model: str,
        alt_model: str,
    ) -> dict:
        """Derive design endpoints with two models and diff the contracts (no AI diff)."""
        primary = ai_engine.generate_design_endpoints(all_stories, context, ux_brief=ux_brief, model=primary_model)
        alt = ai_engine.generate_design_endpoints(all_stories, context, ux_brief=ux_brief, model=alt_model)
        return ai_engine.diff_endpoint_sets(primary, alt)

    def generate_design_section(
        self,
        all_stories: list[dict],
        context: str,
        section: str,
        prior_sections: dict[str, str],
        instructions: str = "",
    ) -> str:
        if section == "ux_brief":
            return ai_engine.generate_design_ux_brief(all_stories, context, instructions=instructions)
        if section == "endpoints":
            return ai_engine.generate_design_endpoints(
                all_stories, context,
                ux_brief=prior_sections.get("ux_brief", ""),
                instructions=instructions,
            )
        if section == "data_model":
            return ai_engine.generate_design_data_model(
                all_stories, context,
                endpoints=prior_sections.get("endpoints", ""),
                instructions=instructions,
            )
        if section == "runtime":
            return ai_engine.generate_design_runtime_spec(
                all_stories, context,
                endpoints=prior_sections.get("endpoints", ""),
                data_model=prior_sections.get("data_model", ""),
                instructions=instructions,
            )
        raise ValueError(f"Unknown design section: {section!r}")

    def generate_design_delta(
        self,
        new_stories: list[dict],
        context: str,
        existing_design: str,
        instructions: str = "",
        next_ids: dict[str, int] | None = None,
    ) -> dict:
        return ai_engine.generate_design_delta(
            new_stories, context, existing_design, instructions=instructions, next_ids=next_ids,
        )
