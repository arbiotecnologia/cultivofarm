from pathlib import Path
import importlib.util

spec = importlib.util.spec_from_file_location('b2b_real', Path(__file__).with_name('b2b-partner-real-rls-local.py'))
if spec is None or spec.loader is None:
    raise RuntimeError('local policy runner unavailable')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.main(organizations=True)