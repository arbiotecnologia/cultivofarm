"""Assemble the inactive proof installer: exact PRE pins, candidate, POST, COMMIT.

PRE pins come from the read-only LIVE capture (legacy bodies/ACL/triggers/storage
helpers) and from the atomic package's exact POST body of the delivery barrier.
POST is exact when capture/post-expected.json exists (generated on disposable PG).
"""
import hashlib, json, re
from pathlib import Path
H = Path(__file__).resolve().parent
ATOMIC = H.parent / 'delivery-atomic-hardening-20261030'
def lit(s): return "'" + s.replace("'", "''") + "'"
def statement(s): return s.rstrip().rstrip(';') + ';\n'

LEGACY = ['public.rpc_gerar_formulario_entrega(p_entrega_id uuid)',
          'public.rpc_coletar_assinatura_digital_entrega(p_entrega_id uuid, p_payload jsonb)',
          'public.rpc_anexar_comprovante_entrega(p_entrega_id uuid, p_payload jsonb)']
HELPERS = ['platform_private.storage1_delivery_allowed(p_name text, p_action text)',
           'public.is_delivery_staff(_uid uuid)', 'platform_private.h15_actor_organization()',
           'public._entrega_seed_checklist(_entrega_id uuid)',
           'public.fn_entrega_comprovante_exigir_arquivo_v1()', 'public.fn_entrega_assinatura_exigir_imagem_v1()',
           'public.fn_entrega_comprovante_preservar_encerrado_v1()', 'public.fn_sync_entrega_financial_status()']
NEW = ['platform_private.delivery_proof_actor_20261030', 'platform_private.delivery_proof_row_ok_20261030',
       'platform_private.delivery_proof_gate_20261030', 'platform_private.delivery_proof_payload_20261030',
       'platform_private.delivery_proof_apply_20261030', 'public.rpc_entrega_comprovacao_preflight_v1',
       'public.rpc_entrega_formulario_gerar_v1', 'public.rpc_entrega_assinatura_coletar_v1',
       'public.rpc_entrega_comprovante_anexar_v1']
REPLACED = ['platform_private.delivery_mutation_guard_20261030', 'public.rpc_gerar_formulario_entrega',
            'public.rpc_coletar_assinatura_digital_entrega', 'public.rpc_anexar_comprovante_entrega']

def fn_pin(f, label):
    return (f"IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE "
            f"format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid))={lit(f['signature'])} "
            f"AND md5(pg_get_functiondef(p.oid))={lit(f['md5'])} AND pg_get_userbyid(p.proowner)={lit(f['owner'])} "
            f"AND p.proacl::text IS NOT DISTINCT FROM {lit(f['acl']) if f['acl'] is not None else 'NULL'}) "
            f"THEN RAISE EXCEPTION '{label}: %',{lit(f['signature'])}; END IF;")

def pre():
    cur = json.loads((ATOMIC / 'capture/current.json').read_text())
    by = {f['signature']: f for f in cur['functions']}
    out = ["IF to_regprocedure('public.rpc_entrega_comprovante_anexar_v1(uuid,text,jsonb)') IS NOT NULL THEN RAISE EXCEPTION 'DELIVERY_PROOF_ALREADY_INSTALLED'; END IF;",
           "IF to_regclass('platform_private.delivery_context_20261030') IS NULL OR to_regclass('platform_private.delivery_requests_20261030') IS NULL THEN RAISE EXCEPTION 'DELIVERY_PROOF_ATOMIC_PACKAGE_MISSING'; END IF;"]
    for s in LEGACY + HELPERS:
        f = by[s]; assert hashlib.md5(f['body'].encode()).hexdigest() == f['md5'], s
        out.append(fn_pin(f, 'DELIVERY_PROOF_PRE_FUNCTION_DRIFT'))
    # Barrier must be exactly the atomic package POST body (group/cancel branches).
    atomic_post = json.loads((ATOMIC / 'capture/post-expected.json').read_text())
    guard = [x for x in atomic_post if "'delivery_mutation_guard_20261030'" in x['expression']]
    assert len(guard) == 1 and len(guard[0]['expected']) == 1
    g = guard[0]['expected'][0]
    out.append(f"IF (SELECT md5(pg_get_functiondef(to_regprocedure('platform_private.delivery_mutation_guard_20261030()')))) IS DISTINCT FROM {lit(hashlib.md5(g['body'].encode()).hexdigest())} THEN RAISE EXCEPTION 'DELIVERY_PROOF_PRE_GUARD_DRIFT'; END IF;")
    for t in cur['triggers']:
        if t['table'] in ('entrega_comprovantes', 'entregas'):
            out.append(f"IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass({lit(t['schema']+'.'+t['table'])}) AND tgname={lit(t['name'])} AND pg_get_triggerdef(oid)={lit(t['definition'])} AND tgenabled={lit(t['enabled'])}) THEN RAISE EXCEPTION 'DELIVERY_PROOF_PRE_TRIGGER_DRIFT: %',{lit(t['name'])}; END IF;")
    out.append("IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.entregas'::regclass AND tgname='zz_delivery_mutation_closed' AND tgenabled='O') THEN RAISE EXCEPTION 'DELIVERY_PROOF_PRE_BARRIER_MISSING'; END IF;")
    # Client DML on proofs is closed by ACL today; keep it pinned.
    out.append("IF has_table_privilege('authenticated','public.entrega_comprovantes','INSERT') OR has_table_privilege('authenticated','public.entrega_comprovantes','UPDATE') OR has_table_privilege('authenticated','public.entrega_comprovantes','DELETE') OR has_table_privilege('anon','public.entrega_comprovantes','INSERT') THEN RAISE EXCEPTION 'DELIVERY_PROOF_PRE_COMPROVANTE_ACL'; END IF;")
    out.append("IF has_table_privilege('authenticated','public.entregas','UPDATE') OR has_table_privilege('authenticated','public.entregas','INSERT') THEN RAISE EXCEPTION 'DELIVERY_PROOF_PRE_ENTREGAS_ACL'; END IF;")
    out.append("IF to_regclass('public.entrega_formulario_seq') IS NULL OR to_regclass('storage.objects') IS NULL THEN RAISE EXCEPTION 'DELIVERY_PROOF_PRE_DEPENDENCY'; END IF;")
    return 'DO $pre$ BEGIN\n' + '\n'.join(out) + '\nEND $pre$;\n'

def fn_expr(qualified):
    s, n = qualified.split('.')
    return (f"(SELECT coalesce(jsonb_agg(jsonb_build_object('signature',format('%I.%I(%s)',ns.nspname,p.proname,pg_get_function_identity_arguments(p.oid)),'md5',md5(pg_get_functiondef(p.oid)),'acl',p.proacl::text,'owner',pg_get_userbyid(p.proowner),'secdef',p.prosecdef,'config',p.proconfig::text) ORDER BY 1),'[]'::jsonb) "
            f"FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname={lit(s)} AND p.proname={lit(n)})")

def post_expressions():
    return [fn_expr(x) for x in NEW + REPLACED]

def post():
    exp = H / 'capture/post-expected.json'
    lines = []
    if exp.exists():
        for i, x in enumerate(json.loads(exp.read_text())):
            lines.append(f"IF {x['expression']} IS DISTINCT FROM {lit(json.dumps(x['expected']))}::jsonb THEN RAISE EXCEPTION 'DELIVERY_PROOF_POST_DRIFT: {i}'; END IF;")
    for f in NEW[:5] + ['platform_private.delivery_mutation_guard_20261030']:
        lines.append(f"IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname||'.'||p.proname={lit(f)} AND (has_function_privilege('authenticated',p.oid,'EXECUTE') OR has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('service_role',p.oid,'EXECUTE'))) THEN RAISE EXCEPTION 'DELIVERY_PROOF_POST_PRIVATE_ACL: %',{lit(f)}; END IF;")
    for sig in ['public.rpc_entrega_comprovacao_preflight_v1(uuid,text)', 'public.rpc_entrega_formulario_gerar_v1(uuid,text)',
                'public.rpc_entrega_assinatura_coletar_v1(uuid,text,jsonb)', 'public.rpc_entrega_comprovante_anexar_v1(uuid,text,jsonb)']:
        lines.append(f"IF NOT has_function_privilege('authenticated',{lit(sig)},'EXECUTE') OR has_function_privilege('anon',{lit(sig)},'EXECUTE') OR has_function_privilege('service_role',{lit(sig)},'EXECUTE') THEN RAISE EXCEPTION 'DELIVERY_PROOF_POST_RPC_ACL: %',{lit(sig)}; END IF;")
    for sig in ['public.rpc_gerar_formulario_entrega(uuid)', 'public.rpc_coletar_assinatura_digital_entrega(uuid,jsonb)', 'public.rpc_anexar_comprovante_entrega(uuid,jsonb)']:
        lines.append(f"IF has_function_privilege('authenticated',{lit(sig)},'EXECUTE') OR has_function_privilege('service_role',{lit(sig)},'EXECUTE') OR has_function_privilege('anon',{lit(sig)},'EXECUTE') THEN RAISE EXCEPTION 'DELIVERY_PROOF_POST_LEGACY_OPEN: %',{lit(sig)}; END IF;")
    lines.append("IF has_table_privilege('authenticated','public.entregas','UPDATE') OR has_table_privilege('authenticated','public.entrega_comprovantes','UPDATE') THEN RAISE EXCEPTION 'DELIVERY_PROOF_POST_DML_OPEN'; END IF;")
    return 'DO $post$ BEGIN\n' + '\n'.join(lines) + '\nEND $post$;\n'

ROLLBACK = """-- Deny-only rollback: keeps history, requests, barrier and closed legacy writers.
BEGIN; SET LOCAL lock_timeout='3s';
REVOKE ALL ON FUNCTION public.rpc_entrega_comprovacao_preflight_v1(uuid,text),public.rpc_entrega_formulario_gerar_v1(uuid,text),public.rpc_entrega_assinatura_coletar_v1(uuid,text,jsonb),public.rpc_entrega_comprovante_anexar_v1(uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION platform_private.delivery_proof_apply_20261030(p_action text,p_entrega uuid,p_request_key text,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN RAISE EXCEPTION 'DELIVERY_PROOF_ROLLBACK_CLOSED' USING ERRCODE='42501';END$$;
CREATE OR REPLACE FUNCTION public.rpc_entrega_comprovacao_preflight_v1(p_entrega_id uuid,p_action text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN RAISE EXCEPTION 'DELIVERY_PROOF_ROLLBACK_CLOSED' USING ERRCODE='42501';END$$;
REVOKE ALL ON FUNCTION platform_private.delivery_proof_apply_20261030(text,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
"""

def build():
    cand = statement((H / 'candidate.sql.review').read_text())
    p, q = pre(), post()
    (H / 'preflight.sql.review').write_text(p)
    (H / 'postflight.sql.review').write_text(q)
    (H / 'install.sql.review').write_text("-- INACTIVE. Apply only after delivery-atomic-hardening install, in the same window.\nBEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='30s';\n" + p + cand + '\n' + q + 'COMMIT;\n')
    (H / 'rollback.sql.review').write_text(ROLLBACK)

if __name__ == '__main__': build()
