import json, os, subprocess, tempfile, unittest, pathlib, shutil
D = pathlib.Path(__file__).parent; ROOT = D.parents[1]
OUT = {k: False for k in ('COMMUNICATION_DELIVERY_ENABLED','EMAIL_DELIVERY_ENABLED','WHATSAPP_DELIVERY_ENABLED','COMMUNICATION_INAPP_ADAPTER_ENABLED','WHATSAPP_WEBHOOK_ENABLED')}
AUT = {k: False for k in ('NF_EMISSION_ENABLED','SEFAZ_TRANSMISSION_ENABLED','BOLETO_EMISSION_ENABLED','AUTO_RECEIVABLE_ENABLED')}
PRE = {k: True for k in ('schema_confirmed','synthetic_data_confirmed','automations_verified_blocked','access_confirmed')}
HC = dict(reviewer='SINTÉTICO', checked_at='2026-10-29T19:40Z', statement='teste unitário')
def evid(mode='HOMOLOG_ISOLATED', **kw):
    d = dict(mode=mode, runtime_url='https://homolog.example.invalid' if mode != 'PROD_READONLY' else 'https://app.cultivofarm.com.br',
             observed_project_ref='vrlcdwmlytukrjezrrnf' if mode != 'PROD_READONLY' else 'swzpzcwiasxmjutrmvkm', commit='a'*40, outputs=dict(OUT), human_check=HC)
    if mode == 'HOMOLOG_ISOLATED': d.update(automations=dict(AUT), write_prereqs=dict(PRE))
    d.update(kw); return json.dumps(d)
def run(raw=None, mode='HOMOLOG_ISOLATED', scope='READONLY', path=None, root=ROOT):
    e = {k: v for k, v in os.environ.items() if not k.startswith('PREFLIGHT_')}
    if raw is not None:
        f = tempfile.NamedTemporaryFile('w', delete=False, suffix='.json'); f.write(raw); f.close(); e['PREFLIGHT_EVIDENCE'] = f.name
    if mode: e['PREFLIGHT_MODE'] = mode
    if scope: e['PREFLIGHT_SCOPE'] = scope
    e['PREFLIGHT_ROOT'] = str(root)
    if path is not None: e['PATH'] = path
    r = subprocess.run([shutil.which('bash'), str(D / 'preflight.sh')], env=e, capture_output=True, text=True); return r.returncode, r.stdout
class T(unittest.TestCase):
    def test_says_evidence_validator_only(self): self.assertIn('não verifica runtime', run(evid())[1])
    def test_no_mode_or_scope_denies(self):
        self.assertEqual(run(evid(), mode='')[0], 1); self.assertEqual(run(evid(), scope='')[0], 1)
    def test_homolog_readonly_go(self): self.assertEqual(run(evid())[0], 0)
    def test_homolog_write_go_only_with_all_prereqs(self): self.assertEqual(run(evid(), scope='WRITE_SCENARIOS')[0], 0)
    def test_homolog_write_blocked_current_state(self):
        c, o = run(evid(write_prereqs={k: False for k in PRE}), scope='WRITE_SCENARIOS'); self.assertEqual(c, 2); self.assertIn('READONLY=GO WRITE_SCENARIOS=BLOCKED', o)
    def test_write_blocked_without_automation_proof(self):
        d = json.loads(evid()); del d['automations']; self.assertEqual(run(json.dumps(d), scope='WRITE_SCENARIOS')[0], 2)
    def test_automation_on_denies_write(self): self.assertEqual(run(evid(automations={**AUT, 'AUTO_RECEIVABLE_ENABLED': True}), scope='WRITE_SCENARIOS')[0], 1)
    def test_prod_write_always_denied(self):
        c, o = run(evid('PROD_READONLY'), mode='PROD_READONLY', scope='WRITE_SCENARIOS'); self.assertEqual(c, 1); self.assertIn('READONLY=GO WRITE_SCENARIOS=DENY', o)
    def test_duplicate_flag_false_5x_denies(self):
        raw = evid().replace('"outputs": {', '"outputs": {' + '"EMAIL_DELIVERY_ENABLED": false, ' * 4, 1)
        c, o = run(raw); self.assertEqual(c, 1); self.assertIn('chave repetida', o)
    def test_contradictory_flag_denies(self):
        raw = evid().replace('"outputs": {', '"outputs": {"EMAIL_DELIVERY_ENABLED": true, ', 1); self.assertEqual(run(raw)[0], 1)
    def test_string_false_not_accepted(self): self.assertEqual(run(evid(outputs={**OUT, 'EMAIL_DELIVERY_ENABLED': 'false'}))[0], 1)
    def test_missing_flag_blocked(self):
        o = dict(OUT); del o['WHATSAPP_WEBHOOK_ENABLED']; self.assertEqual(run(evid(outputs=o))[0], 2)
    def test_observed_prod_with_declared_homolog_denies(self):
        c, o = run(evid(observed_project_ref='swzpzcwiasxmjutrmvkm')); self.assertEqual(c, 1); self.assertIn('ref observado de produção', o)
    def test_ref_substring_not_accepted(self): self.assertEqual(run(evid(observed_project_ref='xvrlcdwmlytukrjezrrnfx'))[0], 1)
    def test_homolog_with_prod_url_denies(self): self.assertEqual(run(evid(runtime_url='https://app.cultivofarm.com.br'))[0], 1)
    def test_version_substring_or_missing_blocked(self):
        self.assertEqual(run(evid(commit='a'*40 + 'b'))[0], 2); self.assertEqual(run(evid(commit='v1'))[0], 2)
    def test_mode_mismatch_denies(self): self.assertEqual(run(evid('PROD_READONLY'), mode='HOMOLOG_ISOLATED')[0], 1)
    def test_missing_human_check_blocked(self): self.assertEqual(run(evid(human_check={}))[0], 2)
    def test_missing_evidence_blocked(self): self.assertEqual(run(None)[0], 2)
    def test_missing_rg_denies(self):
        tmp = tempfile.mkdtemp(); [os.symlink(shutil.which(b), os.path.join(tmp, b)) for b in ('python3', 'dirname')]
        c, o = run(evid(), path=tmp + ':/usr/bin/env-none'); self.assertEqual(c, 1); self.assertIn('rg ausente', o)
    def test_wrong_root_denies(self):
        c, o = run(evid(), root=pathlib.Path(tempfile.mkdtemp())); self.assertEqual(c, 1); self.assertIn('raiz do projeto inválida', o)
    def test_non_object_root_never_go(self):
        for raw in ('[]', 'null', 'true', '123', '"x"', '""', '[{}]'):
            with self.subTest(raw=raw):
                c, o = run(raw); self.assertNotEqual(c, 0); self.assertIn('READONLY=DENY WRITE_SCENARIOS=DENY', o)
    def test_malformed_url_not_go(self):
        for u in ('https://[::1', 'https://[zz]/', 'http://app.cultivofarm.com.br', '', 'https://'):
            with self.subTest(u=u): self.assertNotEqual(run(evid(runtime_url=u))[0], 0)
if __name__ == '__main__': unittest.main(verbosity=2)
