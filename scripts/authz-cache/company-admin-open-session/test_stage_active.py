import importlib.util
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('admin_stage_active', HERE/'stage-active.py')
if spec is None or spec.loader is None:
    raise RuntimeError('stage_missing')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class ActiveStageTests(unittest.TestCase):
    def test_deactivation_only_gate_exact_original_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)/'out'
            module.stage(out,'deactivation')
            self.assertEqual([str(p.relative_to(out)) for p in out.rglob('*') if p.is_file()], [module.GATE])
            gate = (out/module.GATE).read_bytes()
            self.assertEqual(gate,(HERE/'deactivation.ts.review').read_bytes())
            self.assertIn(b'COMPANY_ADMIN_CONTEXT_MONITOR_ENABLED: boolean = false',gate)
            self.assertIn(b'FINANCIAL_CONTEXT_MONITOR_ENABLED: boolean = true',gate)
            self.assertIn(b'PRODUCER_CONTEXT_MONITOR_ENABLED: boolean = true',gate)

    def test_rollback_original_artifacts(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)/'out'
            m=module.verify()
            module.stage(out,'rollback')
            for item in m['files']:
                if item['rollback'] is not None:
                    self.assertEqual((out/item['path']).read_bytes(),(HERE/item['rollback']).read_bytes())
            self.assertTrue((out/'REMOVE-NEW-FILES.review.json').is_file())

    def test_active_gate_and_other_scope_drift_rejected_before_write(self):
        original=module.ROOT
        m=module.verify()
        try:
            with tempfile.TemporaryDirectory() as tmp:
                root=Path(tmp)/'root'
                for path in m['source_sha256']:
                    target=root/path
                    target.parent.mkdir(parents=True,exist_ok=True)
                    target.write_bytes((original/path).read_bytes())
                module.ROOT=root
                gate=root/module.GATE
                active=gate.read_bytes()
                for bad in (active.replace(b'COMPANY_ADMIN_CONTEXT_MONITOR_ENABLED: boolean = true',b'COMPANY_ADMIN_CONTEXT_MONITOR_ENABLED: boolean = false'),active.replace(b'FINANCIAL_CONTEXT_MONITOR_ENABLED: boolean = true',b'FINANCIAL_CONTEXT_MONITOR_ENABLED: boolean = false')):
                    gate.write_bytes(bad)
                    out=Path(tmp)/'out'
                    with self.assertRaisesRegex(ValueError,'active_gate_drift'):
                        module.stage(out,'deactivation')
                    self.assertFalse(out.exists())
                gate.write_bytes(active)
                p=root/'src/hooks/useStorageAccessScope.ts'
                p.write_bytes(p.read_bytes()+b'drift')
                with self.assertRaisesRegex(ValueError,'source_drift'):
                    module.stage(Path(tmp)/'rollback','rollback')
                self.assertFalse((Path(tmp)/'rollback').exists())
        finally:
            module.ROOT=original

    def test_original_stage_fails_closed_on_active_source(self):
        spec=importlib.util.spec_from_file_location('original_stage',HERE/'stage.py')
        if spec is None or spec.loader is None:
            raise RuntimeError('stage_missing')
        original=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(original)
        with tempfile.TemporaryDirectory() as tmp:
            out=Path(tmp)/'out'
            with self.assertRaisesRegex(ValueError,'source_drift'):
                original.stage(out,'candidate')
            self.assertFalse(out.exists())

if __name__=='__main__':
    unittest.main()