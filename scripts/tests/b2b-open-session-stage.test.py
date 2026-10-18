"""Guard tests only; no SQL, approval or deployment performed."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

path = Path(__file__).resolve().parents[1] / "authz-cache/b2b-open-session/stage-review.py"
spec = importlib.util.spec_from_file_location("stage_review", path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class StageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name) / "repo"
        self.root.mkdir()
        module.ROOT = self.root
        gate = self.root / module.GATE
        gate.parent.mkdir(parents=True)
        gate.write_text('export const AUTHZ_CACHE_FOUNDATION_ENABLED: boolean = false;\nexport const AUTHZ_CACHE_ROLLOUT_SCOPE = "b2b-context";\n')
        self.gate = gate
        self.original = gate.read_bytes()
        self.manifest = {"files": {module.GATE: module.sha(self.original)}}
        self.receipt = {"project_ref": module.REF, "scope": "b2b-context",
            "manifest_sha256": module.sha(json.dumps(self.manifest, sort_keys=True).encode())}
        for field in ("canonical_rpc_reviewed", "rls_rpc_denials_reviewed", "bounded_observation_accepted",
                      "legacy_signed_urls_excluded", "rollback_client_drain_reviewed", "auditor_release"):
            self.receipt[field] = True  # SYNTHETIC receipt, not real approval.
        self.output = Path(self.temp.name) / "stage"

    def tearDown(self):
        self.temp.cleanup()

    def test_only_stages_exact_candidate_and_rollback(self):
        module.stage(self.manifest, self.receipt, self.output)
        self.assertEqual(self.gate.read_bytes(), self.original)
        self.assertIn("= true;", (self.output / "gate-candidate.ts.review").read_text())
        self.assertEqual((self.output / "gate-rollback.ts.review").read_bytes(), self.original)
        guards = json.loads((self.output / "gate-guards.json").read_text())
        self.assertEqual(guards["post_sha256"], module.sha((self.output / "gate-candidate.ts.review").read_bytes()))
        self.assertTrue(guards["rollback_requires_exact_post"])

    def test_utf8_lf_bytes_and_hashes_preserved(self):
        self.assert_exact_utf8_artifacts("\n")

    def test_utf8_crlf_bytes_and_hashes_preserved(self):
        self.assert_exact_utf8_artifacts("\r\n")

    def assert_exact_utf8_artifacts(self, newline):
        # Accents exercise locale corruption; CRLF exercises newline normalization.
        baseline = newline.join([
            "// Autorização: prévia, revisão e sessão — não publicar.",
            "export const AUTHZ_CACHE_FOUNDATION_ENABLED: boolean = false;",
            'export const AUTHZ_CACHE_ROLLOUT_SCOPE = "b2b-context";', "",
        ]).encode("utf-8")
        self.gate.write_bytes(baseline)
        manifest = {"files": {module.GATE: module.sha(baseline)}}
        receipt = {**self.receipt, "manifest_sha256": module.sha(
            json.dumps(manifest, sort_keys=True).encode("utf-8"))}
        # Artifact generation must never depend on locale or text newline APIs.
        with patch.object(Path, "read_text", side_effect=AssertionError("locale text read")), \
             patch.object(Path, "write_text", side_effect=AssertionError("locale text write")):
            module.stage(manifest, receipt, self.output)
        rollback = (self.output / "gate-rollback.ts.review").read_bytes()
        candidate = (self.output / "gate-candidate.ts.review").read_bytes()
        guards = json.loads((self.output / "gate-guards.json").read_bytes().decode("utf-8"))
        self.assertEqual(self.gate.read_bytes(), baseline)
        self.assertEqual(rollback, baseline)
        self.assertEqual(candidate, baseline.replace(
            b"AUTHZ_CACHE_FOUNDATION_ENABLED: boolean = false;",
            b"AUTHZ_CACHE_FOUNDATION_ENABLED: boolean = true;"))
        self.assertEqual(guards["pre_sha256"], module.sha(rollback))
        self.assertEqual(guards["pre_sha256"], module.sha(baseline))
        self.assertEqual(guards["post_sha256"], module.sha(candidate))

    def test_wrong_or_missing_ref_rejected(self):
        for ref in (None, "not-canonical"):
            with self.subTest(ref=ref), self.assertRaisesRegex(ValueError, "canonical_ref"):
                module.stage(self.manifest, {**self.receipt, "project_ref": ref}, self.output)
        self.assertFalse(self.output.exists())

    def test_missing_approval_and_string_true_rejected(self):
        for value in (None, "true", False):
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "approval_missing"):
                module.stage(self.manifest, {**self.receipt, "auditor_release": value}, self.output)
        self.assertFalse(self.output.exists())

    def test_source_drift_rejected(self):
        self.gate.write_text("drift")
        with self.assertRaisesRegex(ValueError, "source_drift"):
            module.stage(self.manifest, self.receipt, self.output)
        self.assertFalse(self.output.exists())

    def test_receipt_manifest_mismatch_rejected(self):
        with self.assertRaisesRegex(ValueError, "receipt_manifest_mismatch"):
            module.stage(self.manifest, {**self.receipt, "manifest_sha256": "wrong"}, self.output)

    def test_project_output_rejected(self):
        with self.assertRaisesRegex(ValueError, "staging_inside_project"):
            module.stage(self.manifest, self.receipt, self.root / "src")
        self.assertEqual(self.gate.read_bytes(), self.original)

if __name__ == "__main__":
    unittest.main()