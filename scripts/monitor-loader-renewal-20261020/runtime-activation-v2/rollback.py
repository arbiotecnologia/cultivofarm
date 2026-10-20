"""Rollback manual do monitor v2 -> baseline 165c628e. Não toca CQ; recusa drift. Não publica."""
import hashlib,json,pathlib,sys
R=pathlib.Path(__file__).resolve().parent; root=R.parents[2]
m=json.loads((R/'manifest.json').read_text()); h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for p,s in m['cq_preserved'].items():
  if h(root/p)!=s: sys.exit('ROLLBACK_BLOCKED: CQ drift '+p)
plan=[]
for t,f in m['files'].items():
  tp,bp=root/t,R/f['rollback']
  if h(bp)!=f['pre_sha256']: sys.exit('ROLLBACK_BLOCKED: baseline drift '+f['rollback'])
  c=h(tp)
  if c==f['pre_sha256']: continue
  if c!=f['post_sha256']: sys.exit('ROLLBACK_BLOCKED: runtime drift '+t)
  plan.append((tp,bp))
for tp,bp in plan: tp.write_bytes(bp.read_bytes())
print(f'{len(plan)} arquivos restaurados; CQ preservado; publicação permanece manual')
