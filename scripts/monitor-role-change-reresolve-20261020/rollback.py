"""Rollback manual do candidato role-change -> runtime monitor v2 (ace8f12d, publicado 0feac450).
Recusa drift; não toca CQ/SQL; não publica. Só necessário se o candidato for ativado no futuro."""
import hashlib,json,pathlib,sys
H=pathlib.Path(__file__).resolve().parent; root=H.parents[1]
m=json.loads((H/'manifest.json').read_text()); h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for p,s in m['preserved'].items():
  if h(root/p)!=s: sys.exit('ROLLBACK_BLOCKED: preserved drift '+p)
ua=root/'src/hooks/useAuth.tsx'; base=H/'rollback/useAuth.tsx.baseline'; lib=root/'src/lib/authz/roleChangeReresolve.ts'
if h(base)!=m['baseline_sha256']: sys.exit('ROLLBACK_BLOCKED: baseline copy drift')
c=h(ua)
if c==m['baseline_sha256'] and not lib.exists(): print('Runtime já é baseline; nada a fazer'); sys.exit(0)
if c!=m['candidate_sha256'] or (lib.exists() and h(lib)!=m['lib_sha256']): sys.exit('ROLLBACK_BLOCKED: runtime drift')
ua.write_bytes(base.read_bytes())
if lib.exists(): lib.unlink()
print('Baseline monitor v2 restaurada; CQ preservado; publicação manual')
