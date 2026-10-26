"""PostgreSQL DESCARTAVEL apenas. Auth sintetica (request.jwt.claims); NAO e JWT/RLS hospedado.
Reaproveita a cadeia capturada do pacote accounting-pending (create LIVE byte-exato, prosrc
7a634235...) e aplica o candidato de fechamento duravel de tentativa."""
from pathlib import Path
import json, subprocess, sys, time, hashlib
D = Path(__file__).resolve().parent
AP = D.parent / 'accounting-pending-request-20261024' / 'test-local.py'
src = AP.read_text()
setup = src[:src.index("r1=json.loads(val(G,create(P,'pend-1'")]
G0 = {'__file__': str(AP), '__name__': 'harness'}
exec(compile(setup, str(AP), 'exec'), G0)
pg, ok, val, actor, snapshot, create, jwt = (G0[k] for k in ('pg', 'ok', 'val', 'actor', 'snapshot', 'create', 'jwt'))
G, GT, T, PR, GB, ADMIN, ADMIN_B, P, Q, hA, items = (G0[k] for k in ('G', 'GT', 'T', 'PR', 'GB', 'ADMIN', 'ADMIN_B', 'P', 'Q', 'hA', 'items'))
U = G0['U']
print('==== attempt-closure-20261026 ====', flush=True)
BASE = len(G0['checks'])
PINS = json.loads((D / 'live-pins.json').read_text())
EXP = json.loads((D / 'expected.json').read_text())
H = EXP['candidate_prosrc_md5']
import os
q = lambda s: pg.sql(s)
pmd5 = lambda sig: q(f"SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('{sig}')")
CREATE = 'public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)'
ok('harness create equals LIVE prosrc md5 7a634235 and LIVE ACL',
   pmd5(CREATE) == PINS['create_prosrc_md5'] and q(f"SELECT proacl::text FROM pg_proc WHERE oid=to_regprocedure('{CREATE}')") == PINS['create_acl'])
ok('harness c2_order_actor_scope equals LIVE functiondef/ACL',
   q("SELECT md5(pg_get_functiondef(oid))||' '||proacl::text FROM pg_proc WHERE oid=to_regprocedure('platform_private.c2_order_actor_scope(uuid,uuid)')") == PINS['scope'])

# Pins que o harness (schema reduzido) não reproduz são substituídos SÓ na cópia de teste e reportados.
harness = {
 'has_role_prosrc_md5': pmd5('public.has_role(uuid,public.app_role)'),
 'get_user_partner_id_prosrc_md5': pmd5('public.get_user_partner_id()'),
 'poi_cols': q("SELECT md5(string_agg(attname||':'||format_type(atttypid,atttypmod)||':'||attnotnull,',' ORDER BY attnum)) FROM pg_attribute WHERE attrelid='public.partner_order_idempotency'::regclass AND attnum>0 AND NOT attisdropped"),
 'poi_policies': q("SELECT md5(string_agg(policyname||'|'||permissive||'|'||cmd||'|'||array_to_string(roles,',')||'|'||coalesce(qual,'')||'|'||coalesce(with_check,''),'#' ORDER BY policyname)) FROM pg_policies WHERE schemaname='public' AND tablename='partner_order_idempotency'"),
}
subst = {k: (PINS[k], v) for k, v in harness.items() if v != PINS[k]}
print('HARNESS_PIN_SUBSTITUTIONS', json.dumps(subst), flush=True)
def h(text):
    for _, (live, local) in subst.items(): text = text.replace(live, local)
    return text
pre, cand, post = (h((D / f).read_text()) for f in ('preflight.sql', 'candidate.sql.review', 'postflight.sql'))
rb, rbfull = (h((D / f).read_text()) for f in ('rollback.sql.review', 'rollback-full-if-empty.sql.review'))
print('HARNESS_POI_INDEXES', q("SELECT string_agg(c.relname||':'||i.indisunique||':'||(SELECT array_agg(a.attname ORDER BY k.ord) FROM unnest(i.indkey) WITH ORDINALITY k(attnum,ord) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum)::text, ' ') FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE i.indrelid='public.partner_order_idempotency'::regclass"), flush=True)
if not q("SELECT count(*) FROM pg_index WHERE indrelid='public.partner_order_idempotency'::regclass")=='0': raise SystemExit('unexpected harness indexes')
# Réplica reduzida não traz índices; recria os DOIS índices LIVE capturados (pkey id; único partner_id+key) — fidelidade, reportado.
q("ALTER TABLE public.partner_order_idempotency ADD CONSTRAINT partner_order_idempotency_pkey PRIMARY KEY (id); CREATE UNIQUE INDEX ux_partner_order_idempotency_key ON public.partner_order_idempotency USING btree (partner_id, idempotency_key);")
print('HARNESS_FIDELITY_FIX LIVE indexes recreated on reduced replica', flush=True)
