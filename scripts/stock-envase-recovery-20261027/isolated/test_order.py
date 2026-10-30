"""Serialization-only regression: tuple permutations equal; changes never disappear."""
import itertools, unittest
from assemble import STATE
def canonical(tuples): return sorted(tuples,key=lambda t:tuple(v.encode('utf-8') for v in t))
class DeterministicOrder(unittest.TestCase):
    def test_permutations_equal(self):
        rows=[['public.lotes','zz_guard','O','body1'],['public.envase','á_guard','O','body2'],['public.envase','a_guard','O','body3']]
        for perm in itertools.permutations(rows): self.assertEqual(canonical(perm),canonical(rows))
    def test_missing_added_changed_reject(self):
        rows=[['public.lotes','guard','O','body']]
        for changed in [[],rows+[['public.lotes','extra','O','body']], [['public.lotes','guard','D','body']], [['public.lotes','guard','O','changed']]]: self.assertNotEqual(canonical(rows),canonical(changed))
    def test_sql_orders_tuple_columns(self):
        self.assertIn('ORDER BY tgrelid::regclass::text COLLATE "C",tgname COLLATE "C",tgenabled::text COLLATE "C"',STATE)
        self.assertNotIn('ORDER BY 1',STATE)
if __name__=='__main__': unittest.main()