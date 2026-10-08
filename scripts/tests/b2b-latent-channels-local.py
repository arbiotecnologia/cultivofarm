"""Disposable PostgreSQL only; no real Auth, PII, Storage bytes or API writes."""
import sys
import importlib.util
from pathlib import Path

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("b2b_policy_runner", Path(__file__).with_name("b2b-partner-real-rls-local.py"))
if spec is None or spec.loader is None:
    raise RuntimeError("runner unavailable")
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
runner.main(channels=True)