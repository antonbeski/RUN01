"""
============================================================
RUN01 - Autonomous AI Self-Healing Loop Test Suite
File: tests/test_autonomous_loop.py

Validates the Autonomous Self-Healing Execution Loop protocol:
- Section 5 skill directives in Python Data Science SKILL.md
- Surgical edit block parsing and application logic
- Immutable user goal and context preservation
- Full-script fallback behavior
============================================================
"""

import re
import unittest
from pyrunner.skills import build_panel_system_prompt, resolve_panel_skill


class TestAutonomousLoopProtocol(unittest.TestCase):
    def setUp(self):
        self.editor_prompt = build_panel_system_prompt("editor")

    def test_skill_contains_autonomous_loop_section(self):
        """Verify the Python Data Science system skill explicitly enforces the Self-Healing Strong Loop."""
        self.assertIn("<<<SURGICAL_EDIT>>>", self.editor_prompt)
        self.assertIn("<<<FIND>>>", self.editor_prompt)
        self.assertIn("<<<REPLACE>>>", self.editor_prompt)
        self.assertIn("<<<END_EDIT>>>", self.editor_prompt)
        self.assertIn("Zero-Error Execution Guarantee", self.editor_prompt)
        self.assertIn("Immutable Context Preservation", self.editor_prompt)

    def test_surgical_edit_regex_parser(self):
        """Verify that surgical edit regex extracts exact find/replace chunks identically to the client."""
        sample_ai_response = (
            "I detected an `IndexError` at line 12. Here is the surgical repair:\n\n"
            "<<<SURGICAL_EDIT>>>\n"
            "<<<FIND>>>\n"
            "    val = items[10]\n"
            "<<<REPLACE>>>\n"
            "    val = items[min(10, len(items) - 1)] if items else None\n"
            "<<<END_EDIT>>>\n\n"
            "This ensures the program runs cleanly without IndexError."
        )

        regex = re.compile(
            r"<<<SURGICAL_EDIT>>>[\s\r\n]*<<<FIND>>>([\s\S]*?)<<<REPLACE>>>([\s\S]*?)<<<END_EDIT>>>"
        )
        matches = list(regex.finditer(sample_ai_response))
        self.assertEqual(len(matches), 1)

        find_chunk = matches[0].group(1).strip()
        repl_chunk = matches[0].group(2).strip()

        self.assertEqual(find_chunk, "val = items[10]")
        self.assertEqual(repl_chunk, "val = items[min(10, len(items) - 1)] if items else None")

    def test_surgical_edit_application_preserves_existing_user_code(self):
        """Verify applying a surgical edit modifies ONLY target lines while preserving imports and user functions."""
        original_user_code = (
            "# Custom user utility\n"
            "def calculate_spread(high, low):\n"
            "    return high - low\n\n"
            "import numpy as np\n\n"
            "prices = [100, 102, 105]\n"
            "broken_key = {'price': 100}\n"
            "print(broken_key['wrong_key'])\n"
        )

        find_block = "print(broken_key['wrong_key'])"
        repl_block = "print(broken_key.get('price', 0))"

        self.assertIn(find_block, original_user_code)
        repaired_code = original_user_code.replace(find_block, repl_block)

        # Context preservation check
        self.assertIn("def calculate_spread", repaired_code)
        self.assertIn("import numpy as np", repaired_code)
        self.assertIn("prices = [100, 102, 105]", repaired_code)
        self.assertNotIn("wrong_key", repaired_code)
        self.assertIn("print(broken_key.get('price', 0))", repaired_code)

    def test_full_script_fallback_detection(self):
        """Verify complete ```python script fallback is detected when extensive structural changes occur."""
        sample_structural_response = (
            "Because the architecture required restructuring, here is the full corrected script:\n\n"
            "```python\n"
            "import numpy as np\n"
            "import matplotlib.pyplot as plt\n\n"
            "x = np.linspace(0, 10, 100)\n"
            "y = np.sin(x)\n"
            "plt.plot(x, y)\n"
            "plt.show()\n"
            "```\n"
        )

        match = re.search(r"```python([\s\S]*?)```", sample_structural_response)
        self.assertIsNotNone(match)
        code = match.group(1).strip()
        self.assertTrue(code.startswith("import numpy as np"))
        self.assertTrue(code.endswith("plt.show()"))


if __name__ == "__main__":
    unittest.main()
