"""Rollback piso 12000 -> 10000 (somente authzEpochMonitor.ts). Recusa drift; não publica; não reabre nada."""
import hashlib, pathlib, sys
H = pathlib.Path(__file__).resolve().parent; root = H.parents[1]
f = root / 'src/lib/authz/authzEpochMonitor.ts'; base = H / 'rollback/authzEpochMonitor.ts.baseline'
BASE = 'febf394c270758376370df87ebdc1f05749a54badb46065e573dad09bd828069'
CAND = '109d5b817e01895b6b2d0d8b8068795486a468cba72a3d6312d7f10209704238'
h = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
if h(base) != BASE: sys.exit('ROLLBACK_BLOCKED: baseline copy drift')
cur = h(f)
if cur == BASE: print('Já está na baseline 10000'); sys.exit(0)
if cur != CAND: sys.exit('ROLLBACK_BLOCKED: runtime drift')
f.write_bytes(base.read_bytes()); print('Piso 10000 restaurado; testes de piso 12s passarão a falhar; publicação manual')
