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

    def test_data_explorer_skill_isolation(self):
        skill = resolve_panel_skill("data")
        self.assertIn("data", skill["key"])
        prompt = build_panel_system_prompt("data")
        self.assertIn("FRED", prompt)
        self.assertIn("yf_download", prompt)
        self.assertNotIn("OpenSCAD", prompt)

    def test_editor_skill_isolation(self):
        skill = resolve_panel_skill("editor")
        self.assertEqual(skill["key"], "editor")
        prompt = build_panel_system_prompt("editor")
        self.assertIn("Pyodide", prompt)
        self.assertIn("plt.show()", prompt)
        self.assertNotIn("OpenSCAD", prompt)

    def test_api_models_endpoint_groq_only(self):
        resp = self.client.get("/api/ai/models")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertIsInstance(data, list)
        self.assertGreaterEqual(len(data), 7)
        allowed_ids = {
            "llama-3.3-70b-versatile",
            "llama3-70b-8192",
            "llama-3.1-8b-instant",
            "openai/gpt-oss-120b",
            "openai/gpt-oss-20b",
            "qwen/qwen3.8-27b",
            "allam-2-7b",
            "openai/gpt-oss-safeguard-20b",
            "meta-llama/llama-prompt-guard-2-86m",
            "meta-llama/llama-prompt-guard-2-22m",
        }
        for item in data:
            self.assertEqual(item["provider"], "Groq")
            self.assertIn(item["id"], allowed_ids)

    def test_api_skills_endpoint(self):
        resp = self.client.get("/api/ai/skills")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertIsInstance(data, list)
        panel_keys = [item["panel_key"] for item in data]
        for expected in ["data", "editor"]:
            self.assertIn(expected, panel_keys)
        self.assertNotIn('physics', panel_keys)
        self.assertNotIn('cad', panel_keys)
        self.assertNotIn('desmos', panel_keys)

if __name__ == "__main__":
    unittest.main()
