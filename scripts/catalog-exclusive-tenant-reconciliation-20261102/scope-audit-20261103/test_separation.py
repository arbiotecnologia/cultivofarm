import hashlib
import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = Path(__file__).resolve().parent


class CatalogOnlySeparation(unittest.TestCase):
    def test_original_financial_contracts_are_exact(self):
        manifest = json.loads((EVIDENCE / 'separation-manifest.json').read_text())
        for row in manifest['records']:
            if row['action'] != 'restore_base':
                continue
            with self.subTest(path=row['path']):
                actual = (ROOT / row['path']).read_bytes()
                original = subprocess.check_output(['git', 'show', manifest['base'] + ':' + row['path']], cwd=ROOT)
                self.assertEqual(actual, original)
                self.assertEqual(hashlib.sha256(actual).hexdigest(), row['baseline_sha256'])

    def test_candidates_are_preserved_and_unmounted(self):
        manifest = json.loads((EVIDENCE / 'separation-manifest.json').read_text())
        for row in manifest['records']:
            with self.subTest(path=row['path']):
                preserved = (ROOT / row['candidate_path']).read_bytes()
                self.assertEqual(hashlib.sha256(preserved).hexdigest(), row['candidate_sha256'])
                if row['action'] == 'defer_from_runtime':
                    self.assertFalse((ROOT / row['path']).exists())

    def test_production_has_only_original_payment_signatures(self):
        snapshot = json.loads((EVIDENCE / 'production-contracts.json').read_text())
        functions = {row['name']: row for row in snapshot['functions']}
        self.assertEqual(snapshot['expected_ref'], 'swzpzcwiasxmjutrmvkm')
        self.assertNotIn('partner_payment_condition_capability_v1', functions)
        self.assertNotIn('rpc_receivable_money_projection_v1', functions)
        self.assertNotIn('p_payment_choice', functions['create_partner_order_secure']['args'])
        self.assertNotIn('p_payment_choice', functions['simulate_b2b_payment_plan_secure']['args'])
        self.assertEqual(functions['rpc_register_receivable_payment']['result'], 'uuid')
        self.assertEqual(functions['approve_partner_order']['result'], 'void')

    def test_catalog_keeps_only_pure_shared_date_dependency(self):
        source = (ROOT / 'src/lib/fiscal/ownedProductFiscal.ts').read_text()
        self.assertIn('import { isCivilDate } from "@/lib/comercial/civilDate"', source)
        dates = (ROOT / 'src/lib/comercial/civilDate.ts').read_text()
        self.assertNotIn('supabase', dates)
        for path in ROOT.joinpath('src').rglob('*'):
            if path.suffix not in ['.ts', '.tsx'] or '/test/' in str(path):
                continue
            with self.subTest(path=str(path)):
                text = path.read_text()
                self.assertNotIn('partner_payment_condition_capability_v1', text)
                self.assertNotIn('rpc_receivable_money_projection_v1', text)

    def test_journal_is_original_not_a_payment_fallback(self):
        original = subprocess.check_output(['git', 'show', '9d3a9424:src/lib/authz/orderJournal.ts'], cwd=ROOT)
        self.assertEqual((ROOT / 'src/lib/authz/orderJournal.ts').read_bytes(), original)
        journal = original.decode()
        self.assertIn("rpc('partner_order_journal_capability_v1',{p_partner:partner}", journal)
        self.assertIn("rpc('recover_partner_order_attempt_v1',{p_partner:partner", journal)


if __name__ == '__main__':
    unittest.main()