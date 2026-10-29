import os, subprocess, tempfile, unittest, pathlib
S = pathlib.Path(__file__).with_name('preflight.sh')
def run(**env):
    e = {k: v for k, v in os.environ.items() if not k.startswith(('PREFLIGHT_', 'HOMOLOG_'))}; e.update(env)
    r = subprocess.run(['bash', str(S)], env=e, capture_output=True, text=True); return r.returncode, r.stdout
def ev(text):
    f = tempfile.NamedTemporaryFile('w', delete=False, suffix='.txt'); f.write(text); f.close(); return f.name
FLAGS = ''.join(f'{k}=false\n' for k in ('COMMUNICATION_DELIVERY_ENABLED','EMAIL_DELIVERY_ENABLED','WHATSAPP_DELIVERY_ENABLED','COMMUNICATION_INAPP_ADAPTER_ENABLED','WHATSAPP_WEBHOOK_ENABLED'))
class T(unittest.TestCase):
    def test_no_mode_denies(self): self.assertEqual(run()[0], 1)
    def test_unknown_mode_denies(self): self.assertEqual(run(PREFLIGHT_MODE='X', PREFLIGHT_TARGET_REF='vrlcdwmlytukrjezrrnf')[0], 1)
    def test_homolog_rejects_prod_ref(self):
        c, o = run(PREFLIGHT_MODE='HOMOLOG_ISOLATED', PREFLIGHT_TARGET_REF='swzpzcwiasxmjutrmvkm', PREFLIGHT_TARGET_VERSION='v1', PREFLIGHT_VERSION_EVIDENCE=ev('v1'), PREFLIGHT_OUTPUTS_OFF_EVIDENCE=ev(FLAGS))
        self.assertEqual(c, 1); self.assertIn('rejeita ref de produção', o)
    def test_homolog_unapproved_ref_denies(self): self.assertEqual(run(PREFLIGHT_MODE='HOMOLOG_ISOLATED', PREFLIGHT_TARGET_REF='abcdefabcdefabcdefab')[0], 1)
    def test_prod_requires_prod_ref(self): self.assertEqual(run(PREFLIGHT_MODE='PROD_READONLY', PREFLIGHT_TARGET_REF='vrlcdwmlytukrjezrrnf')[0], 1)
    def test_forbidden_ref_denies(self): self.assertEqual(run(PREFLIGHT_MODE='HOMOLOG_ISOLATED', PREFLIGHT_TARGET_REF='ikaauvsflpmamgxmkhoq')[0], 1)
    def test_missing_flags_and_version_blocked(self):
        c, o = run(PREFLIGHT_MODE='HOMOLOG_ISOLATED', PREFLIGHT_TARGET_REF='vrlcdwmlytukrjezrrnf')
        self.assertEqual(c, 2); self.assertIn('BLOCKED versão', o); self.assertIn('BLOCKED saídas', o)
    def test_partial_flags_blocked(self):
        c, o = run(PREFLIGHT_MODE='PROD_READONLY', PREFLIGHT_TARGET_REF='swzpzcwiasxmjutrmvkm', PREFLIGHT_TARGET_VERSION='v1', PREFLIGHT_VERSION_EVIDENCE=ev('v1'), PREFLIGHT_OUTPUTS_OFF_EVIDENCE=ev(FLAGS.replace('EMAIL_DELIVERY_ENABLED=false', 'EMAIL_DELIVERY_ENABLED=true')))
        self.assertEqual(c, 2); self.assertIn('BLOCKED saídas', o)
    def test_version_unverified_blocked(self):
        c, o = run(PREFLIGHT_MODE='PROD_READONLY', PREFLIGHT_TARGET_REF='swzpzcwiasxmjutrmvkm', PREFLIGHT_TARGET_VERSION='v2', PREFLIGHT_VERSION_EVIDENCE=ev('v1'), PREFLIGHT_OUTPUTS_OFF_EVIDENCE=ev(FLAGS))
        self.assertEqual(c, 2); self.assertIn('BLOCKED versão', o)
    def test_all_evidence_go(self):
        c, o = run(PREFLIGHT_MODE='HOMOLOG_ISOLATED', PREFLIGHT_TARGET_REF='vrlcdwmlytukrjezrrnf', PREFLIGHT_TARGET_VERSION='v1', PREFLIGHT_VERSION_EVIDENCE=ev('v1'), PREFLIGHT_OUTPUTS_OFF_EVIDENCE=ev(FLAGS))
        self.assertEqual(c, 0, o)
if __name__ == '__main__': unittest.main(verbosity=2)
