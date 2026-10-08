"""No network/Auth API. Replays candidate SQL on disposable PostgreSQL."""
import importlib.util
from pathlib import Path

path = Path(__file__).with_name("b2b-partner-real-rls-local.py")
spec = importlib.util.spec_from_file_location("b2b_policy_runner", path)
if spec is None or spec.loader is None:
    raise RuntimeError("runner unavailable")
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
runner.main(lifecycle=True)