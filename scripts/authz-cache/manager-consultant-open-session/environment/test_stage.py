import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('paired_environment_stage', HERE / 'stage.py')
if spec is None or spec.loader is None:
    raise RuntimeError('missing_stage')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class EnvironmentStageTests(unittest.TestCase):
    def test_candidate_and_exact_original_rollback(self):
        manifest = json.loads((HERE / 'manifest.json').read_bytes())
        for mode in ('candidate', 'rollback'):
            with tempfile.TemporaryDirectory() as tmp:
                out = Path(tmp) / 'out'
                module.stage(out, mode)
                for item in manifest['files']:
                    if item[mode]:
                        self.assertEqual((out/item['path']).read_bytes(), (HERE/item[mode]).read_bytes())
                self.assertFalse((out/module.GATE).exists())
                if mode == 'rollback':
                    self.assertEqual(json.loads((out/'REMOVE-NEW-FILES.review.json').read_bytes()), ['src/test/config/authzEnvironment.test.ts', 'src/test/config/authzEarlyRenewal.test.ts'])

    def test_deactivation_only_changes_paired_flag(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)/'out'
            module.stage(out, 'deactivation')
            source = (module.ROOT/module.GATE).read_bytes()
            self.assertEqual((out/module.GATE).read_bytes(), source.replace(module.ON,module.OFF,1))
            self.assertEqual([p.relative_to(out).as_posix() for p in out.rglob('*') if p.is_file()], [module.GATE])

    def test_all_source_drift_is_refused_before_output(self):
        original = module.ROOT
        manifest = json.loads((HERE/'manifest.json').read_bytes())
        try:
            with tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)/'root'
                for path in manifest['source_sha256']:
                    p = root/path
                    p.parent.mkdir(parents=True,exist_ok=True)
                    p.write_bytes((original/path).read_bytes())
                module.ROOT = root
                for path in manifest['source_sha256']:
                    p = root/path
                    raw = p.read_bytes()
                    p.write_bytes(raw+b'drift')
                    for mode in ('candidate','rollback','deactivation'):
                        out = Path(tmp)/mode
                        with self.assertRaisesRegex(ValueError,'source_drift'):
                            module.stage(out,mode)
                        self.assertFalse(out.exists())
                    p.write_bytes(raw)
        finally:
            module.ROOT = original

    def test_manifest_and_every_artifact_drift_refused(self):
        original = module.HERE
        manifest = json.loads((HERE/'manifest.json').read_bytes())
        try:
            with tempfile.TemporaryDirectory() as tmp:
                mirror = Path(tmp)/'mirror'
                for path in ['manifest.json',*manifest['artifact_sha256']]:
                    p = mirror/path
                    p.parent.mkdir(parents=True,exist_ok=True)
                    p.write_bytes((original/path).read_bytes())
                module.HERE = mirror
                for path in ['manifest.json',*manifest['artifact_sha256']]:
                    p = mirror/path
                    raw = p.read_bytes()
                    p.write_bytes(raw+b'drift')
                    for mode in ('candidate','rollback','deactivation'):
                        out = Path(tmp)/mode
                        with self.assertRaisesRegex(ValueError,'drift'):
                            module.stage(out,mode)
                        self.assertFalse(out.exists())
                    p.write_bytes(raw)
        finally:
            module.HERE = original

    def test_destinations_and_modes_fail_closed(self):
        with self.assertRaisesRegex(ValueError,'outside_project'):
            module.stage(module.ROOT/'bad','candidate')
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp)/'keep').write_bytes(b'keep')
            with self.assertRaisesRegex(ValueError,'empty_destination'):
                module.stage(tmp,'candidate')
            with self.assertRaisesRegex(ValueError,'invalid_mode'):
                module.stage(tmp,'activation')
            self.assertEqual((Path(tmp)/'keep').read_bytes(),b'keep')

if __name__ == '__main__':
    unittest.main()