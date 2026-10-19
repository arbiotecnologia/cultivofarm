import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("manager_consultant_active", HERE / "stage-active.py")
if spec is None or spec.loader is None:
    raise RuntimeError("stage_missing")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class ActiveTests(unittest.TestCase):
    def test_exact_activation_and_flag_only_deactivation(self):
        off = (HERE / "candidate" / module.GATE).read_bytes()
        for mode in ("activation", "deactivation"):
            with tempfile.TemporaryDirectory() as tmp:
                out = Path(tmp) / "out"
                module.stage(out, mode)
                data = (out / module.GATE).read_bytes()
                self.assertEqual(data, off.replace(module.OFF, module.ON, 1) if mode == "activation" else off)
                self.assertEqual([p.relative_to(out).as_posix() for p in out.rglob("*") if p.is_file()], [module.GATE])
                for name in ("AUTHZ_CACHE_FOUNDATION_ENABLED", "PRODUCER_CONTEXT_MONITOR_ENABLED", "FINANCIAL_CONTEXT_MONITOR_ENABLED", "COMPANY_ADMIN_CONTEXT_MONITOR_ENABLED", "CONSULTANT_CONTEXT_MONITOR_ENABLED", "OPERATOR_CONTEXT_MONITOR_ENABLED"):
                    self.assertIn((name + ": boolean = true;").encode(), data)

    def test_original_rollback(self):
        manifest = json.loads((HERE / "manifest.json").read_bytes())
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "out"
            module.stage(out, "rollback")
            for item in manifest["files"]:
                if item["rollback"]:
                    self.assertEqual((out / item["path"]).read_bytes(), (HERE / item["rollback"]).read_bytes())
            self.assertEqual(json.loads((out / "REMOVE-NEW-FILES.review.json").read_bytes()), [i["path"] for i in manifest["files"] if i["rollback"] is None])

    def test_source_gate_and_assertion_drift_atomic(self):
        original = module.ROOT
        manifest = json.loads((HERE / "manifest.json").read_bytes())
        try:
            for changed in (module.GATE, module.TEST, "src/hooks/useAuth.tsx"):
                with tempfile.TemporaryDirectory() as tmp:
                    root = Path(tmp) / "root"
                    for path in manifest["source_sha256"]:
                        target = root / path
                        target.parent.mkdir(parents=True, exist_ok=True)
                        target.write_bytes((original / path).read_bytes())
                    target = root / changed
                    target.write_bytes(target.read_bytes() + b"drift")
                    module.ROOT = root
                    for mode in ("activation", "deactivation", "rollback"):
                        out = Path(tmp) / mode
                        with self.assertRaisesRegex(ValueError, "source_drift"):
                            module.stage(out, mode)
                        self.assertFalse(out.exists())
        finally:
            module.ROOT = original

    def test_manifest_and_artifact_drift_atomic(self):
        original = module.HERE
        manifest = json.loads((HERE / "manifest.json").read_bytes())
        try:
            for changed in ("manifest.json", "candidate/" + module.GATE):
                with tempfile.TemporaryDirectory() as tmp:
                    mirror = Path(tmp) / "mirror"
                    for path in ["manifest.json", *manifest["artifact_sha256"]]:
                        target = mirror / path
                        target.parent.mkdir(parents=True, exist_ok=True)
                        target.write_bytes((original / path).read_bytes())
                    target = mirror / changed
                    target.write_bytes(target.read_bytes() + b"drift")
                    module.HERE = mirror
                    for mode in ("activation", "deactivation", "rollback"):
                        out = Path(tmp) / mode
                        with self.assertRaisesRegex(ValueError, "drift"):
                            module.stage(out, mode)
                        self.assertFalse(out.exists())
        finally:
            module.HERE = original

    def test_invalid_destination_and_mode(self):
        with self.assertRaisesRegex(ValueError, "outside_project"):
            module.stage(module.ROOT / "bad", "activation")
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "keep").write_bytes(b"keep")
            with self.assertRaisesRegex(ValueError, "empty_destination"):
                module.stage(tmp, "deactivation")
            with self.assertRaisesRegex(ValueError, "invalid_mode"):
                module.stage(tmp, "candidate")
            self.assertEqual((Path(tmp) / "keep").read_bytes(), b"keep")

if __name__ == "__main__":
    unittest.main()