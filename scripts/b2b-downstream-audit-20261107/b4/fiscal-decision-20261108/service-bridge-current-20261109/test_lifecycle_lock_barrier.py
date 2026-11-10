"""Focused harness rules; these unit tests are not PG integration evidence."""
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from lifecycle_lock_barrier import assert_authorization_control, revoke_after_proven_wait


class HarnessRules(unittest.TestCase):
    def test_cancel_authority_accepts_only_expected_in_flight_business_denial(self):
        result = SimpleNamespace(returncode=1, stderr='PT409 B2B_FORECAST_FISCAL_IN_FLIGHT')
        self.assertEqual(assert_authorization_control('forecast_cancel', result),
                         'AUTHORIZATION_PASSED_BUSINESS_IN_FLIGHT_DENIED_NOT_CANCEL_SUCCESS')
        for result in (SimpleNamespace(returncode=0, stderr=''),
                       SimpleNamespace(returncode=1, stderr='42501 B2B_FORECAST_PILOT_DENIED')):
            with self.assertRaises(AssertionError):
                assert_authorization_control('forecast_cancel', result)

    def test_missing_waiter_aborts_without_mutating_and_rolls_back(self):
        calls = []
        T = SimpleNamespace(session=lambda sql: object(),
                            finish=lambda p, sql: (calls.append(sql) or ('', '')))
        B = SimpleNamespace(T=T, run_raw=lambda sql: SimpleNamespace(returncode=0),
                            last=lambda sql: 'true')
        with patch('lifecycle_lock_barrier.poll', side_effect=[
                {'pid': 42, 'state': 'idle in transaction', 'granted': True},
                AssertionError('NOT_PROVEN_ABORT_NO_PASS')]):
            with self.assertRaisesRegex(AssertionError, 'NOT_PROVEN_ABORT_NO_PASS'):
                revoke_after_proven_wait(B, 'SELECT 1 FOR UPDATE;', 'BEGIN;CALL;', 'REVOKE_SENTINEL;')
        self.assertEqual(calls, ['ROLLBACK;'])


if __name__ == '__main__':
    unittest.main()