"""Rollback da margem de renovação 10000 -> 7500 (constante + comentário). Recusa drift; não publica."""
import hashlib, pathlib, sys
H = pathlib.Path(__file__).resolve().parent; root = H.parents[1]
f = root / 'src/lib/authz/authzEpochMonitor.ts'; base = H / 'rollback/authzEpochMonitor.ts.baseline'
BASE = '72b26f0aa94caae2a94cc0c34a1d8297227b3e7388b30a7c3c574db38f96d1a9'
CAND = 'febf394c270758376370df87ebdc1f05749a54badb46065e573dad09bd828069'
h = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
if h(base) != BASE: sys.exit('ROLLBACK_BLOCKED: baseline copy drift')
cur = h(f)
if cur == BASE: print('Já está na baseline 7500'); sys.exit(0)
if cur != CAND: sys.exit('ROLLBACK_BLOCKED: runtime drift')
f.write_bytes(base.read_bytes()); print('Margem 7500 restaurada; useAuth/CQ/anexos intocados; publicação manual')
