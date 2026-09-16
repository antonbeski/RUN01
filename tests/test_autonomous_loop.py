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


    def test_cad_skill_contains_autonomous_loop_section(self):
        """Verify the CAD Studio system skill explicitly enforces the Self-Healing Strong Loop."""
        cad_prompt = build_panel_system_prompt("cad")
        self.assertIn("<<<SURGICAL_EDIT>>>", cad_prompt)
        self.assertIn("<<<FIND>>>", cad_prompt)
        self.assertIn("<<<REPLACE>>>", cad_prompt)
        self.assertIn("<<<END_EDIT>>>", cad_prompt)
        self.assertIn("Zero-Error Execution Guarantee", cad_prompt)
        self.assertIn("OpenSCAD WASM Strong Loop", cad_prompt)
        self.assertIn("Immutable Context & Dimension Preservation", cad_prompt)

    def test_desmos_skill_contains_autonomous_loop_section(self):
        """Verify the Desmos system skill explicitly enforces the Self-Healing Strong Loop."""
        desmos_prompt = build_panel_system_prompt("desmos")
        self.assertIn("<<<SURGICAL_EDIT>>>", desmos_prompt)
        self.assertIn("<<<FIND>>>", desmos_prompt)
        self.assertIn("<<<REPLACE>>>", desmos_prompt)
        self.assertIn("<<<END_EDIT>>>", desmos_prompt)
        self.assertIn("Zero-Error Execution Guarantee", desmos_prompt)
        self.assertIn("Desmos Math Strong Loop", desmos_prompt)
        self.assertIn("Immutable Mathematical Context Preservation", desmos_prompt)

    def test_cad_openscad_error_classification(self):
        """Verify OpenSCAD compiler error extraction identifies error types and line numbers."""
        def parse_openscad_error(error_msg):
            err_type = "OpenSCADCompileError"
            err_line = None
            line_match = re.search(r"line\s+(\d+)", error_msg, re.IGNORECASE) or re.search(r"input\.scad:(\d+)", error_msg, re.IGNORECASE)
            if line_match:
                err_line = int(line_match.group(1))

            if re.search(r"syntax\s+error|parser\s+error", error_msg, re.IGNORECASE):
                err_type = "SyntaxError"
            elif re.search(r"undef\s+variable", error_msg, re.IGNORECASE):
                err_type = "UndefinedVariable"
            elif re.search(r"ignoring unknown module|not defined|unknown module", error_msg, re.IGNORECASE):
                err_type = "UndefinedModule"
            elif re.search(r"recursion\s+depth", error_msg, re.IGNORECASE):
                err_type = "RecursionDepthError"
            elif re.search(r"manifold|cgal", error_msg, re.IGNORECASE):
                err_type = "ManifoldCSGError"

            return err_type, err_line

        # Test 1: SyntaxError at line 14
        err_type, err_line = parse_openscad_error("ERROR: Parser error: syntax error in file /input.scad, line 14")
        self.assertEqual(err_type, "SyntaxError")
        self.assertEqual(err_line, 14)

        # Test 2: UndefinedVariable at line 8
        err_type, err_line = parse_openscad_error("ERROR: undef variable 'wall_thickness' in file /input.scad, line 8")
        self.assertEqual(err_type, "UndefinedVariable")
        self.assertEqual(err_line, 8)

        # Test 3: ManifoldCSGError
        err_type, _ = parse_openscad_error("CGAL error: The given mesh is not a valid 2-manifold")
        self.assertEqual(err_type, "ManifoldCSGError")

    def test_cad_surgical_edit_preserves_dimensions_and_modules(self):
        """Verify OpenSCAD surgical patch fixes target module while preserving all other parameters and geometry."""
        original_scad = (
            "// [Global Dimensions]\n"
            "length = 120;\n"
            "width = 80;\n"
            "height = 40;\n"
            "wall = 2.5;\n"
            "$fn = 60;\n\n"
            "module broken_boss(x, y) {\n"
            "    translate([x, y, 0])\n"
            "        cylinder(r=undef_radius, h=height);\n"
            "}\n\n"
            "module main_box() {\n"
            "    cube([length, width, height]);\n"
            "}\n"
            "main_box();\n"
        )

        find_chunk = "cylinder(r=undef_radius, h=height);"
        replace_chunk = "cylinder(r=wall * 2, h=height);"

        self.assertIn(find_chunk, original_scad)
        repaired_scad = original_scad.replace(find_chunk, replace_chunk)

        self.assertIn("length = 120;", repaired_scad)
        self.assertIn("width = 80;", repaired_scad)
        self.assertIn("height = 40;", repaired_scad)
        self.assertIn("module main_box()", repaired_scad)
        self.assertNotIn("undef_radius", repaired_scad)
        self.assertIn("cylinder(r=wall * 2, h=height);", repaired_scad)

    def test_desmos_expression_error_classification(self):
        """Verify Desmos expression analysis classifies mathematical and LaTeX syntax errors."""
        def classify_desmos_error(msg):
            if re.search(r"not defined|unknown|undefined", msg, re.IGNORECASE):
                return "UndefinedIdentifier"
            elif re.search(r"too many variables|slider", msg, re.IGNORECASE):
                return "TooManyVariables"
            elif re.search(r"dimension|unit", msg, re.IGNORECASE):
                return "DimensionMismatch"
            elif re.search(r"domain|divide by zero", msg, re.IGNORECASE):
                return "DomainError"
            return "SyntaxError"

        self.assertEqual(classify_desmos_error("Cannot resolve undefined symbol 'omega_0'"), "UndefinedIdentifier")
        self.assertEqual(classify_desmos_error("Too many variables: add a slider for 'k'"), "TooManyVariables")
        self.assertEqual(classify_desmos_error("Cannot divide by zero in domain"), "DomainError")
        self.assertEqual(classify_desmos_error("Unexpected token in fraction"), "SyntaxError")

    def test_desmos_surgical_edit_preserves_other_equations(self):
        """Verify Desmos surgical edit patches broken equation while preserving physics sliders and constants."""
        equations = [
            "g = 9.81",
            "v_0 = 15",
            r"\theta = \frac{\pi}{4}",
            r"x(t) = v_0 \cdot \cos(\theta) \cdot t",
            r"y(t) = v_0 \cdot \sin(\theta) \cdot t - \frac{1}{2} g ** t^2",  # broken Python **
            r"(x(t), y(t))"
        ]

        broken_line = r"y(t) = v_0 \cdot \sin(\theta) \cdot t - \frac{1}{2} g ** t^2"
        fixed_line = r"y(t) = v_0 \cdot \sin(\theta) \cdot t - \frac{1}{2} g \cdot t^{2}"

        idx = equations.index(broken_line)
        equations[idx] = fixed_line

        # All other equations intact
        self.assertEqual(equations[0], "g = 9.81")
        self.assertEqual(equations[1], "v_0 = 15")
        self.assertEqual(equations[2], r"\theta = \frac{\pi}{4}")
        self.assertEqual(equations[3], r"x(t) = v_0 \cdot \cos(\theta) \cdot t")
        self.assertEqual(equations[4], fixed_line)
        self.assertEqual(equations[5], r"(x(t), y(t))")


if __name__ == "__main__":
    unittest.main()

