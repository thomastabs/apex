"""story_details.py — Story detail dialog."""

import reflex as rx
from state.board import BoardState


def story_details_dialog() -> rx.Component:
    return rx.dialog.root(
        rx.dialog.content(
            rx.dialog.title(
                BoardState.selected_story_data.get("subject", "Story Details"),
            ),
            rx.vstack(
                rx.text(
                    rx.cond(
                        BoardState.selected_story_data.get("description", "") != "",
                        BoardState.selected_story_data.get("description", ""),
                        rx.text("No description.", color_scheme="gray", size="2"),
                    ),
                    size="2",
                    white_space="pre-wrap",
                ),
                rx.hstack(
                    rx.dialog.close(rx.button("Close", variant="soft")),
                    justify="end",
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
