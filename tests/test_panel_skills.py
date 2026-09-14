import os
import unittest
from pyrunner.skills import (
    PANEL_SKILL_MAP,
    resolve_panel_skill,
    build_panel_system_prompt,
    list_registered_panel_skills,
)
from pyrunner.app import app

class TestPanelSkills(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_registered_skills_exist_on_disk(self):
        for key, path in PANEL_SKILL_MAP.items():
            self.assertTrue(os.path.isfile(path), f"Skill file for {key} missing at {path}")

    def test_cad_skill_isolation(self):
        skill = resolve_panel_skill("cad")
        self.assertIn("cad", skill["key"])
        prompt = build_panel_system_prompt("cad")
        self.assertIn("OpenSCAD", prompt)
        self.assertIn("CSG", prompt)
        self.assertNotIn("yfinance", prompt)
        self.assertNotIn("fred_download", prompt)
        self.assertNotIn("show_mujoco", prompt)

    def test_desmos_skill_isolation(self):
        skill = resolve_panel_skill("desmos")
        self.assertEqual(skill["key"], "desmos")
        prompt = build_panel_system_prompt("desmos")
        self.assertIn("Desmos", prompt)
        self.assertIn("LaTeX", prompt)
        self.assertNotIn("OpenSCAD", prompt)
        self.assertNotIn("yf_download", prompt)
        self.assertNotIn("show_mujoco", prompt)

    def test_physics_skill_isolation(self):
        skill = resolve_panel_skill("physics")
        self.assertIn("physics", skill["key"])
        prompt = build_panel_system_prompt("physics")
        self.assertIn("physics", prompt.lower())
        self.assertIn("mujoco", prompt.lower())
        self.assertNotIn("OpenSCAD", prompt)
        self.assertNotIn("yf_download", prompt)

    def test_data_explorer_skill_isolation(self):
        skill = resolve_panel_skill("data")
        self.assertIn("data", skill["key"])
        prompt = build_panel_system_prompt("data")
        self.assertIn("FRED", prompt)
        self.assertIn("yf_download", prompt)
        self.assertNotIn("OpenSCAD", prompt)
        self.assertNotIn("show_mujoco", prompt)

    def test_editor_skill_isolation(self):
        skill = resolve_panel_skill("editor")
        self.assertEqual(skill["key"], "editor")
        prompt = build_panel_system_prompt("editor")
        self.assertIn("Pyodide", prompt)
        self.assertIn("plt.show()", prompt)
        self.assertNotIn("OpenSCAD", prompt)

    def test_api_skills_endpoint(self):
        resp = self.client.get("/api/ai/skills")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertIsInstance(data, list)
        panel_keys = [item["panel_key"] for item in data]
        for expected in ["cad", "desmos", "physics", "data", "editor"]:
            self.assertIn(expected, panel_keys)

if __name__ == "__main__":
    unittest.main()
