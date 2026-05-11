import reflex as rx

config = rx.Config(
    app_name="apex",
    frontend_port=3000,
    backend_port=8000,
    plugins=[
        rx.plugins.RadixThemesPlugin(
            theme=rx.theme(accent_color="violet", radius="medium", scaling="95%"),
        ),
    ],
)
