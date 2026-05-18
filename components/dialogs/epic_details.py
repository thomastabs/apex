"""epic_details.py — Epic detail/edit dialog."""

import reflex as rx
from state.board import BoardState


def epic_details_dialog() -> rx.Component:
    return rx.dialog.root(
        rx.dialog.content(
            rx.dialog.title("Epic Details"),
            rx.dialog.description("View and edit epic title and description.", class_name="sr-only"),
            rx.vstack(
                # ── Title ────────────────────────────────────────────────────
                rx.vstack(
                    rx.text("Title", size="2", weight="medium"),
                    rx.input(
                        value=BoardState.edit_epic_subject,
                        on_change=BoardState.set_edit_epic_subject,
                        size="2",
                        width="100%",
                    ),
                    spacing="1",
                    width="100%",
                ),
                # ── Description ───────────────────────────────────────────────
                rx.vstack(
                    rx.text("Description", size="2", weight="medium"),
                    rx.text_area(
                        value=BoardState.edit_epic_description,
                        on_change=BoardState.set_edit_epic_description,
                        rows="6",
                        width="100%",
                        placeholder="No description…",
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
                        value=BoardState.edit_epic_tags,
                        on_change=BoardState.set_edit_epic_tags,
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
                        on_click=BoardState.save_epic_edits,
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
            max_width="560px",
            width="90vw",
        ),
        open=BoardState.epic_details_open,
        on_open_change=BoardState.set_epic_details_open,
    )
