#!/usr/bin/env python3
"""Focused regression for outer SELECT terminator normalization."""
import unittest

import current_scope


class StateExpressionTests(unittest.TestCase):
    def test_removes_only_outer_terminator(self):
        expression = current_scope._state_sql_expression(
            "SELECT jsonb_build_object('private_columns', NULL);\n"
        )
        self.assertEqual(expression, "SELECT jsonb_build_object('private_columns', NULL)")
        self.assertNotIn(";)", expression)

    def test_guard_embeds_valid_structural_expression(self):
        doc = {
            "functions": [["public.f()", "md5", "", "postgres", None, False]],
            "trigger_functions": [["public.f()", "md5"]],
            "relations": [["public.t", "", True, False, "postgres"]],
            "triggers": [],
            "structural": {"private_columns": None},
        }
        sql = current_scope._guard(doc, "SELECT jsonb_build_object('private_columns',NULL);", "TEST")
        self.assertIn("((SELECT jsonb_build_object('private_columns',NULL))-'functions'", sql)
        self.assertNotIn("NULL);)-'functions'", sql)

    def test_multiple_statements_fail_closed(self):
        with self.assertRaisesRegex(AssertionError, "STATE_EXPRESSION_MULTIPLE_STATEMENTS"):
            current_scope._state_sql_expression("SELECT 1; SELECT 2;")

    def test_non_select_fails_closed(self):
        with self.assertRaisesRegex(AssertionError, "STATE_EXPRESSION_NOT_SELECT"):
            current_scope._state_sql_expression("CALL do_something();")


if __name__ == "__main__":
    unittest.main()
