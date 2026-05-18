"""create_story.py — New Story dialog."""

import reflex as rx
from state.board import BoardState


def create_story_dialog() -> rx.Component:
    return rx.dialog.root(
        rx.dialog.content(
            rx.dialog.title("New Story"),
            rx.dialog.description("Create a new user story under the selected epic.", class_name="sr-only"),
            rx.form(
                rx.vstack(
                    rx.input(
                        name="subject",
                        placeholder="Story title",
                        required=True,
                        width="100%",
                        auto_focus=True,
                    ),
                    rx.text_area(
                        name="description",
                        placeholder="Description (optional)",
                        rows="3",
                        width="100%",
                    ),
                    rx.hstack(
                        rx.dialog.close(
                            rx.button("Cancel", variant="soft", color_scheme="gray"),
                        ),
                        rx.button("Create", type="submit"),
                        justify="end",
                        spacing="2",
                    ),
                    spacing="3",
                ),
                on_submit=BoardState.create_story,
            ),
            max_width="480px",
        ),
        open=BoardState.create_story_open,
        on_open_change=BoardState.set_create_story_open,
    )
