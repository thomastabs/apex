"""story_details.py — Story detail/edit dialog."""

import reflex as rx
from state.board import BoardState


def story_details_dialog() -> rx.Component:
    return rx.dialog.root(
        rx.dialog.content(
            rx.dialog.title("Story Details"),
            rx.dialog.description("View and edit story title, description, and status.", class_name="sr-only"),
            rx.vstack(
                # ── Epic reference ────────────────────────────────────────────
                rx.cond(
                    BoardState.selected_story_data.get("epic_subject", "") != "",
                    rx.hstack(
                        rx.icon("layers", size=13, color=rx.color("violet", 9)),
                        rx.text(
                            "Epic: ",
                            BoardState.selected_story_data.get("epic_subject", ""),
                            size="1",
                            color=rx.color("gray", 10),
                        ),
                        spacing="1",
                        align="center",
                    ),
                    rx.fragment(),
                ),
                # ── Title ────────────────────────────────────────────────────
                rx.vstack(
                    rx.text("Title", size="2", weight="medium"),
                    rx.input(
                        value=BoardState.edit_story_subject,
                        on_change=BoardState.set_edit_story_subject,
                        size="2",
                        width="100%",
                    ),
                    spacing="1",
                    width="100%",
                ),
                # ── Description ───────────────────────────────────────────────
                rx.vstack(
                    rx.text("Description / Gherkin", size="2", weight="medium"),
                    rx.text_area(
                        value=BoardState.edit_story_description,
                        on_change=BoardState.set_edit_story_description,
                        rows="10",
                        width="100%",
                        placeholder="No description…",
                        font_family="'JetBrains Mono', 'Fira Code', monospace",
                        font_size="12px",
                    ),
                    spacing="1",
                    width="100%",
                ),
                # ── Tags ─────────────────────────────────────────────────────
                rx.vstack(
                    rx.text("Tags", size="2", weight="medium"),
                    rx.text(
                        "Comma-separated — e.g. apex, gherkin",
                        size="1",
                        color=rx.color("gray", 9),
                    ),
                    rx.input(
                        value=BoardState.edit_story_tags,
                        on_change=BoardState.set_edit_story_tags,
                        placeholder="tag1, tag2",
                        size="2",
                        width="100%",
                    ),
                    spacing="1",
                    width="100%",
                ),
                # ── Feedback ──────────────────────────────────────────────────
                rx.cond(
                    BoardState.detail_save_error != "",
                    rx.callout(BoardState.detail_save_error, color="red", size="1"),
                    rx.fragment(),
                ),
                rx.cond(
                    BoardState.detail_save_success != "",
                    rx.callout(BoardState.detail_save_success, color="green", size="1"),
                    rx.fragment(),
                ),
                # ── Actions ───────────────────────────────────────────────────
                rx.hstack(
                    rx.button(
                        rx.hstack(rx.icon("save", size=14), rx.text("Save"), spacing="1"),
                        color_scheme="violet",
                        size="2",
                        on_click=BoardState.save_story_edits,
                    ),
                    rx.spacer(),
                    rx.dialog.close(
                        rx.button("Close", variant="soft", color_scheme="gray", size="2"),
                    ),
                    width="100%",
                ),
                spacing="3",
                width="100%",
            ),
            max_width="640px",
            width="90vw",
        ),
        open=BoardState.story_details_open,
        on_open_change=BoardState.set_story_details_open,
    )
