import reflex as rx
from reflex_base.plugins.sitemap import SitemapPlugin

config = rx.Config(
    app_name="apex",
    frontend_port=3000,
    backend_port=8000,
    show_built_with_reflex=False,
    plugins=[
        rx.plugins.RadixThemesPlugin(
            theme=rx.theme(accent_color="violet", radius="medium", scaling="100%", appearance="dark"),
        ),
    ],
    disable_plugins=[SitemapPlugin],
)
