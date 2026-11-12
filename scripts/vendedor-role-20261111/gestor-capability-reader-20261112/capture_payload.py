#!/usr/bin/env python3
"""Restaura a base final descartável da bateria, reinstala 02e (SHA conferido) e grava a resposta real da capacidade
para gestor/vendedor/financeiro, usada pelo teste de fronteira do cliente. Nunca hospedado."""
import hashlib,json,sys
from pathlib import Path
H=Path(__file__).resolve().parent;sys.path.insert(0,str(H.parent/'writers-20261111'))
import mirror_db
mirror_db.DUMP=Path('/tmp/vendedor-e2e-final.dump')
d=mirror_db.DB(55801);u=lambda n:f"00000000-0000-0000-0000-{n:012d}"
b=(H/'02e-install.sql.review').read_bytes();assert hashlib.sha256(b).hexdigest()==json.loads((H/'manifest.json').read_text())['files']['02e-install.sql.review']
r=d.raw("SET app.expected_ref='swzpzcwiasxmjutrmvkm';"+b.decode());assert r.returncode==0,r.stderr
out={}
for name,uid in [('gestor_comercial',u(30)),('vendedor',u(901)),('financeiro',u(29))]:
    out[name]=dict(actor=uid,org=d.last(f"select organization_id from public.profiles where user_id='{uid}'"),
      payload=json.loads(d.last("SET ROLE authenticated; SET request.jwt.claim.sub='"+uid+"'; SET request.jwt.claims='"+json.dumps({'sub':uid,'role':'authenticated'})+"'; SELECT public.c2_internal_order_entry_capability_v1()::text;")))
    if name=='vendedor': out[name]['seller']=json.loads(d.last("SET ROLE authenticated; SET request.jwt.claim.sub='"+uid+"'; SET request.jwt.claims='"+json.dumps({'sub':uid,'role':'authenticated'})+"'; SELECT public.seller_portfolio_capability_v1()::text;"))
p=Path('/dev-server/src/test/comercial/fixtures');p.mkdir(exist_ok=True)
(p/'capabilityPayloads.mirror-20261112.json').write_text(json.dumps(out,indent=2,ensure_ascii=False)+'\n');(H/'evidence/capability-payloads.json').write_text(json.dumps(out,indent=2,ensure_ascii=False)+'\n')
print(json.dumps(out,indent=1)[:2500])
