"""Canonical entrypoint: real-body disposable test, not the retired VOLATILE-fake harness."""
from pathlib import Path
import runpy
if __name__ == '__main__':
    runpy.run_path(str(Path(__file__).with_name('test-real-local.py')), run_name='__main__')
