"""Reuse complete captured harness; add concurrency before immutable containment tests."""
from pathlib import Path
N=Path(__file__).resolve().parent
source=(N/'test-local.py').read_text()
source=source.replace("env={'__file__'", "env={'suffix':suffix,'__file__'")
marker="exec(compile(suffix,str(H/'test-local.py'),'exec'),env)"
assert source.count(marker)==1
source=source.replace(marker,"exec(compile((N/'concurrency-checks.py').read_text(),str(N/'concurrency-checks.py'),'exec'),env)\nexec(compile((N/'strict-auth-checks.py').read_text(),str(N/'strict-auth-checks.py'),'exec'),env)\nexec(compile((N/'credit-lock-checks.py').read_text(),str(N/'credit-lock-checks.py'),'exec'),env)\nexec(compile((N/'lock-window-checks.py').read_text(),str(N/'lock-window-checks.py'),'exec'),env)\nexec(compile((N/'credit-positive-checks.py').read_text(),str(N/'credit-positive-checks.py'),'exec'),env)\n"+"exec(compile(env.get('suffix',suffix),str(H/'test-local.py'),'exec'),env)")
exec(compile(source,str(N/'test-local.py'),'exec'),{'__file__':str(N/'test-local.py'),'__name__':'__main__'})