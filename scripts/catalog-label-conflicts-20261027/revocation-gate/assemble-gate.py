"""Gera o candidato ADICIONAL (INATIVO) gate de revogação para os 2 RPCs de rótulo. Não executa SQL.
Base: corpos LIVE exatos (../live-functions.json) + delta PT409 (mesma transformação de ../assemble.py) + gate/re-auth/lock_timeout."""
from pathlib import Path
import json, hashlib
H = Path(__file__).resolve().parent; P = H.parent
F = {r['signature']: r for r in json.loads((P / 'live-functions.json').read_text())}
EXTRA = json.loads((P / 'live-extra.json').read_text())
GD = json.loads((H / 'live-gate-deps.json').read_text())
TG = ['platform_update_catalog_label(uuid,timestamp with time zone,text,text,uuid)',
      'platform_set_catalog_label_active(uuid,timestamp with time zone,boolean,text,uuid)']
LIVE = {TG[0]: '75eaa1d0307e9033a6f3ba8e208ee488', TG[1]: '561d3175812dba477a538992d5d02a01'}
PT409 = {TG[0]: 'fdf3adc335996bc4ff90f7a57b8f4370', TG[1]: '55493f9699ec039057915656355e35ae'}
md5 = lambda s: hashlib.md5(s.encode()).hexdigest()
REAUTH = ("  IF platform_private.catalog_metadata_require_actor() IS DISTINCT FROM v_actor THEN\n"
          "    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'catalog_metadata_forbidden'; END IF;\n")
GATE = ("  -- Gate canônico de revogação: writers de user_roles/profiles (a00_cf_user_gate) e convites\n"
        "  -- (a00_cf_invitation_gate) adquirem cf_user_guards_v1.state. Ordem: gate -> idempotência -> linha.\n"
        "  PERFORM 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE;\n"
        "  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT503', MESSAGE = 'catalog_label_gate_unavailable'; END IF;\n"
        "  -- Autoridade fresca (novo snapshot por statement) após a espera do gate.\n" + REAUTH +
        "  -- Mesma chave do catalog_entity_replay (reentrante na transação): espera aqui, revalida antes do replay.\n"
        "  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('catalog-metadata:'||p_idempotency_key::text,0));\n" + REAUTH)
VALID_END = "MESSAGE = 'catalog_label_invalid';\n  END IF;\n"
ROW_END = "MESSAGE = 'catalog_label_unavailable'; END IF;\n"
CFG_OLD = " SET search_path TO ''\nAS $function$"
CFG_NEW = " SET search_path TO ''\n SET lock_timeout TO '3s'\nAS $function$"

def pt409(d):
    for m in ['catalog_label_conflict', 'catalog_label_confirmation_failed']:
        old = f"ERRCODE = '40001', MESSAGE = '{m}'"; assert d.count(old) == 1, m; d = d.replace(old, old.replace('40001', 'PT409'))
    assert "'40001'" not in d; return d

def gate(d):
    for a, b in [(VALID_END, VALID_END + GATE), (ROW_END, ROW_END + "  -- Revalida após a espera do lock de linha, antes do CAS/UPDATE.\n" + REAUTH), (CFG_OLD, CFG_NEW)]:
        assert d.count(a) == 1, a; d = d.replace(a, b)
    return d

T = []
for s in TG:
    r = F[s]; assert md5(r['definition']) == r['md5'] == LIVE[s]
    p = pt409(r['definition']); assert md5(p) == PT409[s]
    g = gate(p); T.append({**{k: v for k, v in r.items() if k != 'definition'}, 'pt409_md5': PT409[s], 'gate': g, 'gate_md5': md5(g)})

def q(v): return 'NULL' if v is None else "'" + str(v).replace("'", "''") + "'"
def fq(s): return s if '.' in s.split('(')[0] else 'public.' + s
def fn(sig, oid, md5s, owner, acl, cfg, sd, label):
    ms = ','.join(q(m) for m in md5s)
    return (f"IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure({q(fq(sig))}) AND oid={oid} AND md5(pg_get_functiondef(oid)) IN ({ms}) "
            f"AND pg_get_userbyid(proowner)={q(owner)} AND proacl::text IS NOT DISTINCT FROM {q(acl)} AND to_jsonb(proconfig) IS NOT DISTINCT FROM {q(json.dumps(cfg))}::jsonb "
            f"AND prosecdef={str(sd).lower()}) THEN RAISE EXCEPTION '{label}: %',{q(sig)}; END IF;")
CFG_GATE = ['search_path=""', 'lock_timeout=3s']
# Fingerprints LIVE (read-only 2026-10-27) dos triggers de gate dos writers de autoridade e do estado do gate.
GATE_TRG = {'public.user_roles': 'c424f35051b12c446683cbc14ace29b4', 'public.profiles': '880559efb52a06f9c949ce11bcacb0cf',
            'public.platform_org_admin_invites': '69cd8ad5b4c74f14d5fb9c9de0955269'}
def guard(mode, acl_override=None):
    L = ["IF (SELECT project_ref FROM public.fiscal_environment_marker LIMIT 1) IS DISTINCT FROM 'swzpzcwiasxmjutrmvkm' THEN RAISE EXCEPTION 'WRONG_PROJECT'; END IF;"]
    for r in T:
        if mode == 'pre':  # aceita só LIVE exato ou candidato PT409 exato (ambos config original)
            L.append(fn(r['signature'], r['oid'], [LIVE[r['signature']], r['pt409_md5']], r['owner'], r['acl'], r['config'], True, 'TARGET_DRIFT'))
        else:
            L.append(fn(r['signature'], r['oid'], [r['gate_md5']], r['owner'], acl_override or r['acl'], CFG_GATE, True, 'TARGET_DRIFT'))
    for s, r in F.items():
        if s not in TG: L.append(fn(s, r['oid'], [r['md5']], r['owner'], r['acl'], r['config'], r['security_definer'], 'DEPENDENCY_DRIFT'))
    seen = set(F)
    for r in EXTRA['functions'] + GD:
        if r['signature'] in seen: continue
        seen.add(r['signature']); L.append(fn(r['signature'], r['oid'], [r['md5']], r['owner'], r['acl'], r['config'], r['security_definer'], 'DEPENDENCY_DRIFT'))
    for t, h in GATE_TRG.items():
        L.append(f"IF (SELECT md5(string_agg(t.tgname||':'||pg_get_triggerdef(t.oid)||':'||md5(pg_get_functiondef(t.tgfoid)),E'\\n' ORDER BY t.tgname)) FROM pg_trigger t WHERE t.tgrelid={q(t)}::regclass AND NOT t.tgisinternal AND t.tgname LIKE 'a00_cf%gate') IS DISTINCT FROM {q(h)} THEN RAISE EXCEPTION 'GATE_WRITER_DRIFT: %',{q(t)}; END IF;")
    L.append("IF (SELECT md5(c.relacl::text||(SELECT count(*)::text FROM cf_user_guards_v1.state WHERE singleton)) FROM pg_class c WHERE c.oid='cf_user_guards_v1.state'::regclass) IS DISTINCT FROM '5ce50bbddf1812266f32f016f6abaaa9' THEN RAISE EXCEPTION 'GATE_STATE_DRIFT'; END IF;")
    for t in EXTRA['tables']:
        L.append(f"IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=to_regclass({q('public.'+t['table'])}) AND c.relacl::text IS NOT DISTINCT FROM {q(t['acl'])} AND c.relrowsecurity={str(t['rls']).lower()} AND (SELECT md5(coalesce(string_agg(t.tgname||':'||pg_get_triggerdef(t.oid)||':'||md5(pg_get_functiondef(t.tgfoid)),E'\\n' ORDER BY t.tgname),'')) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal)={q(t['triggers'])} AND (SELECT md5(coalesce(string_agg(row(pol.polname,pol.polcmd,pol.polpermissive,pol.polroles,pg_get_expr(pol.polqual,pol.polrelid),pg_get_expr(pol.polwithcheck,pol.polrelid))::text,E'\\n' ORDER BY pol.polname),'')) FROM pg_policy pol WHERE pol.polrelid=c.oid)={q(t['policies'])}) THEN RAISE EXCEPTION 'TABLE_DRIFT: %',{q(t['table'])}; END IF;")
    return 'DO $guard$ BEGIN\n' + '\n'.join(L) + '\nEND $guard$;\n'

hdr = '-- INATIVO / REVIEW ONLY. Não aplicar pelo agente. Ref swzpzcwiasxmjutrmvkm. Substitui (não exige) o candidato PT409 isolado.\n'
body = '\n'.join(r['gate'].rstrip('\n') + ';' for r in T) + '\n'
(H / 'functions-gate.sql.review').write_text(body)
(H / 'preflight-gate-readonly.sql').write_text(hdr + 'BEGIN READ ONLY;\n' + guard('pre') + 'ROLLBACK;\n')
(H / 'postflight-gate-readonly.sql').write_text(hdr + 'BEGIN READ ONLY;\n' + guard('post') + 'ROLLBACK;\n')
(H / 'candidate-gate.sql.review').write_text(hdr + "BEGIN;\nSET LOCAL lock_timeout='3s';\n" + guard('pre') + body + guard('post') + 'COMMIT;\n')
CONT = '{postgres=X/postgres,service_role=X/postgres}'
revoke = ''.join(f"REVOKE EXECUTE ON FUNCTION {fq(r['signature'])} FROM authenticated;\n" for r in T)
(H / 'rollback-containment.sql.review').write_text(
    hdr + "-- Contenção deny-only: NÃO restaura o corpo LIVE (vulnerável à revogação durante espera) nem o PT409 isolado.\n"
    "-- Só a partir do candidato-gate exato; remove EXECUTE de authenticated (UI passa a 42501). Forward-fix por novo pacote revisado.\n"
    "BEGIN;\nSET LOCAL lock_timeout='3s';\n" + guard('post') + revoke + guard('post', CONT) + 'COMMIT;\n')
(H / 'manifest-gate.json').write_text(json.dumps({'ref': 'swzpzcwiasxmjutrmvkm', 'inactive': True, 'targets': [{k: v for k, v in r.items() if k != 'gate'} for r in T],
    'config_after': CFG_GATE, 'containment_acl': CONT, 'gate_writer_triggers': GATE_TRG, 'gate_state_fp': '5ce50bbddf1812266f32f016f6abaaa9'}, indent=2) + '\n')
print([(r['signature'].split('(')[0], r['gate_md5']) for r in T])
