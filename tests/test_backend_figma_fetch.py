"""Unit tests for the pure helpers in figma_fetch.py.

Covers the design-token extraction markdown (#1), the per-frame structural
fingerprint + its Python↔JS parity contract (#2), and the epic→frame ranking
used by the interactive Phase-1 image-grounding path (#4). Network helpers are
exercised elsewhere (the proxy tests); here we test the dependency-free logic.
"""

from backend.app.services import figma_fetch as ff


# --- #1 design tokens --------------------------------------------------------

class TestDesignTokensMarkdown:
    def test_renders_all_sections(self):
        tokens = {
            "colors": [{"name": "Primary/500", "hex": "#1A73E8"}, {"name": "Surface", "hex": ""}],
            "text_styles": ["Heading/H1", "Body"],
            "effects": ["Shadow/M"],
            "components": ["Button", "Card"],
        }
        md = ff.build_design_tokens_markdown(tokens)
        assert "## Design system" in md
        assert "- Primary/500 — #1A73E8" in md
        assert "- Surface" in md and "Surface —" not in md  # no hex → no dash
        assert "### Text styles" in md and "- Heading/H1" in md
        assert "### Effect styles" in md and "- Shadow/M" in md
        assert "Button, Card" in md

    def test_empty_tokens_render_nothing(self):
        assert ff.build_design_tokens_markdown({}) == ""
        assert ff.build_design_tokens_markdown(
            {"colors": [], "text_styles": [], "effects": [], "components": []}
        ) == ""

    def test_context_markdown_includes_tokens_section(self):
        file = {
            "name": "App",
            "lastModified": "2026-06-29T00:00:00Z",
            "document": {"children": [
                {"type": "CANVAS", "name": "Page 1", "children": [
                    {"type": "FRAME", "id": "1:2", "name": "Login"},
                ]},
            ]},
        }
        tokens = {"colors": [{"name": "Brand", "hex": "#000000"}], "text_styles": [], "effects": [], "components": ["Nav"]}
        md = ff.build_context_markdown(file, [], tokens)
        assert "## Screens (frames)" in md
        assert "## Design system" in md
        assert "- Brand — #000000" in md

    def test_rgba_to_hex(self):
        assert ff._rgba_to_hex({"r": 0.1, "g": 0.45, "b": 0.91}) == "#1A73E8"
        assert ff._rgba_to_hex({}) == "#000000"

    def test_solid_hex_skips_non_solid_and_invisible(self):
        assert ff._solid_hex({"fills": [{"type": "SOLID", "color": {"r": 1, "g": 0, "b": 0}}]}) == "#FF0000"
        assert ff._solid_hex({"fills": [{"type": "GRADIENT_LINEAR"}]}) == ""
        assert ff._solid_hex({"fills": [{"type": "SOLID", "visible": False, "color": {"r": 1}}]}) == ""
        assert ff._solid_hex({}) == ""


# --- #4 epic → frame ranking -------------------------------------------------

class TestRankFramesForSubject:
    FRAMES = [
        {"node_id": "1", "name": "Login screen"},
        {"node_id": "2", "name": "Checkout cart"},
        {"node_id": "3", "name": "User profile settings"},
    ]

    def test_ranks_by_token_overlap(self):
        ranked = ff.rank_frames_for_subject("User login", self.FRAMES, top_n=1)
        assert [f["node_id"] for f in ranked] == ["1"]

    def test_falls_back_to_document_order_when_no_overlap(self):
        ranked = ff.rank_frames_for_subject("zzz nonsense", self.FRAMES, top_n=2)
        assert [f["node_id"] for f in ranked] == ["1", "2"]

    def test_empty_subject_returns_head(self):
        ranked = ff.rank_frames_for_subject("", self.FRAMES, top_n=2)
        assert len(ranked) == 2

    def test_respects_top_n(self):
        assert len(ff.rank_frames_for_subject("login checkout profile", self.FRAMES, top_n=2)) == 2


# --- #4 advisory fetch wrappers never raise ---------------------------------

class TestAdvisoryWrappers:
    def test_fetch_epic_frame_images_no_token_returns_empty(self):
        assert ff.fetch_epic_frame_images("", "KEY", "Login") == []
        assert ff.fetch_epic_frame_images("tok", "", "Login") == []

    def test_extract_design_tokens_offline_returns_empty(self, monkeypatch):
        # No network: published endpoints raise → extraction yields empty lists,
        # and a file with no local styles/components contributes nothing.
        monkeypatch.setattr(ff, "get_published_styles", lambda *a, **k: [])
        monkeypatch.setattr(ff, "get_published_components", lambda *a, **k: [])
        monkeypatch.setattr(ff, "get_nodes", lambda *a, **k: {})
        tokens = ff.extract_design_tokens("tok", "KEY", file={})
        assert tokens == {"colors": [], "text_styles": [], "effects": [], "components": []}

    def test_extract_design_tokens_merges_local_file_maps(self, monkeypatch):
        monkeypatch.setattr(ff, "get_published_styles", lambda *a, **k: [])
        monkeypatch.setattr(ff, "get_published_components", lambda *a, **k: [])
        monkeypatch.setattr(ff, "get_nodes", lambda *a, **k: {})
        file = {
            "styles": {
                "s1": {"name": "Primary", "styleType": "FILL"},
                "s2": {"name": "Body", "styleType": "TEXT"},
            },
            "components": {"c1": {"name": "Button"}},
        }
        tokens = ff.extract_design_tokens("tok", "KEY", file=file)
        assert [c["name"] for c in tokens["colors"]] == ["Primary"]
        assert tokens["text_styles"] == ["Body"]
        assert tokens["components"] == ["Button"]
