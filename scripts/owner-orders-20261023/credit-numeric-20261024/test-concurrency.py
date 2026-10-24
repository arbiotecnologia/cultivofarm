"""Reuse complete captured harness; add concurrency before immutable containment tests."""
from pathlib import Path
N=Path(__file__).resolve().parent
source=(N/'test-local.py').read_text()
marker="exec(compile(suffix,str(H/'test-local.py'),'exec'),env)"
assert source.count(marker)==1
source=source.replace(marker,"exec(compile((N/'concurrency-checks.py').read_text(),str(N/'concurrency-checks.py'),'exec'),env)\n"+marker)
exec(compile(source,str(N/'test-local.py'),'exec'),{'__file__':str(N/'test-local.py'),'__name__':'__main__'})