"""Assemble the capability/grant delta on top of the APPLIED release-combined (atomic+proof).
PRE pins come from the atomic post-expected capture, with the group writer rebased to the stock/envase v2 POST hash."""
import hashlib, json
from pathlib import Path
H = Path(__file__).resolve().parent
ATOMIC = H.parent / 'delivery-atomic-hardening-20261030'
V2 = H.parent / 'stock-envase-recovery-20261027'
PINS = {
    'public.rpc_cockpit_criar_entrega_v1(p_os_id uuid, p_origem text, p_itens jsonb, p_request_key text, p_dados jsonb, p_os_observed timestamp with time zone)': 'public.rpc_cockpit_criar_entrega_v1(uuid,text,jsonb,text,jsonb,timestamptz)',
    'public.rpc_entrega_cancelar_v1(p_entrega_id uuid, p_motivo text, p_observed timestamp with time zone)': 'public.rpc_entrega_cancelar_v1(uuid,text,timestamptz)',
    'public.rpc_entrega_cancelar_v1(p_entrega_id uuid, p_motivo text)': 'public.rpc_entrega_cancelar_v1(uuid,text)',
    'public.rpc_cockpit_criar_entrega_v1(p_os_id uuid, p_origem text, p_estoque_produto_id uuid, p_quantidade numeric, p_dados jsonb)': 'public.rpc_cockpit_criar_entrega_v1(uuid,text,uuid,numeric,jsonb)',
    'platform_private.delivery_actor_20261030(p_action text)': 'platform_private.delivery_actor_20261030(text)',
}
GROUP, CANCEL = 'public.rpc_cockpit_criar_entrega_v1(uuid,text,jsonb,text,jsonb,timestamptz)', 'public.rpc_entrega_cancelar_v1(uuid,text,timestamptz)'
CAP = 'public.rpc_entrega_operacoes_capability_v1()'
lit = lambda s: "'" + s.replace("'", "''") + "'"

def pins():
    found = {}
    for e in json.loads((ATOMIC / 'capture/post-expected.json').read_text()):
        for x in e['expected'] if isinstance(e['expected'], list) else []:
            if isinstance(x, dict) and x.get('signature') in PINS:
                found[PINS[x['signature']]] = (hashlib.md5(x['body'].encode()).hexdigest(), x['acl'], x['owner'])
    assert len(found) == len(PINS), found
    # Rebased: install order is release-combined -> stock/envase v2 -> this delta. The v2 candidate replaces the
    # group writer body (ACL/owner unchanged), so its PRE pin is the exact v2 POST hash, never the stale baseline.
    v2 = json.loads((V2 / 'v2-post-hashes.json').read_text())
    md5, acl, owner = found[GROUP]
    found[GROUP] = (v2[GROUP], acl, owner)
    return found

CAP_BODY = """CREATE FUNCTION public.rpc_entrega_operacoes_capability_v1()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE g boolean:=false; c boolean:=false;
BEGIN
 -- Release gate only: reports whether the caller would pass the canonical actor check now.
 -- The writers re-authorize independently; this result never grants authority.
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'DELIVERY_ACTOR_DENIED' USING ERRCODE='42501'; END IF;
 BEGIN PERFORM platform_private.delivery_actor_20261030('group'); g:=true; EXCEPTION WHEN insufficient_privilege THEN g:=false; END;
 BEGIN PERFORM platform_private.delivery_actor_20261030('cancel'); c:=true; EXCEPTION WHEN insufficient_privilege THEN c:=false; END;
 RETURN jsonb_build_object('capability','delivery_operations_v1','group',g,'cancel',c);
END $$;"""

def build():
    p = pins()
    pre = ["IF to_regprocedure('public.rpc_entrega_operacoes_capability_v1()') IS NOT NULL THEN RAISE EXCEPTION 'DELIVERY_CAP_ALREADY_INSTALLED'; END IF;",
           "IF to_regprocedure('public.rpc_entrega_comprovante_anexar_v1(uuid,text,jsonb)') IS NULL OR NOT has_function_privilege('authenticated','public.rpc_entrega_comprovante_anexar_v1(uuid,text,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'DELIVERY_CAP_PRE_PROOF_MISSING'; END IF;",
           "IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.entregas'::regclass AND tgname='zz_delivery_mutation_closed' AND tgenabled='O') THEN RAISE EXCEPTION 'DELIVERY_CAP_PRE_BARRIER_MISSING'; END IF;",
           "IF has_table_privilege('authenticated','public.entregas','INSERT') OR has_table_privilege('authenticated','public.entregas','UPDATE') OR has_table_privilege('authenticated','public.entregas','DELETE') THEN RAISE EXCEPTION 'DELIVERY_CAP_PRE_DML_OPEN'; END IF;"]
    for sig, (md5, acl, owner) in sorted(p.items()):
        pre.append(f"IF (SELECT md5(pg_get_functiondef(to_regprocedure({lit(sig)})))) IS DISTINCT FROM {lit(md5)} OR (SELECT proacl::text FROM pg_proc WHERE oid=to_regprocedure({lit(sig)})) IS DISTINCT FROM {lit(acl)} OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=to_regprocedure({lit(sig)})) IS DISTINCT FROM {lit(owner)} THEN RAISE EXCEPTION 'DELIVERY_CAP_PRE_DRIFT: %',{lit(sig)}; END IF;")
    post = [f"IF (SELECT md5(pg_get_functiondef(to_regprocedure({lit(s)})))) IS DISTINCT FROM {lit(p[s][0])} THEN RAISE EXCEPTION 'DELIVERY_CAP_POST_BODY: %',{lit(s)}; END IF;" for s in sorted(p)]
    for s in (GROUP, CANCEL, CAP):
        post.append(f"IF NOT has_function_privilege('authenticated',{lit(s)},'EXECUTE') OR has_function_privilege('anon',{lit(s)},'EXECUTE') OR has_function_privilege('service_role',{lit(s)},'EXECUTE') THEN RAISE EXCEPTION 'DELIVERY_CAP_POST_ACL: %',{lit(s)}; END IF;")
    post += ["IF has_function_privilege('authenticated','public.rpc_entrega_cancelar_v1(uuid,text)','EXECUTE') OR has_function_privilege('authenticated','public.rpc_cockpit_criar_entrega_v1(uuid,text,uuid,numeric,jsonb)','EXECUTE') OR has_function_privilege('authenticated','platform_private.delivery_actor_20261030(text)','EXECUTE') THEN RAISE EXCEPTION 'DELIVERY_CAP_POST_LEGACY_OPEN'; END IF;",
             "IF has_table_privilege('authenticated','public.entregas','INSERT') OR has_table_privilege('authenticated','public.entregas','UPDATE') OR has_table_privilege('authenticated','public.entregas','DELETE') THEN RAISE EXCEPTION 'DELIVERY_CAP_POST_DML_OPEN'; END IF;",
             "IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.entregas'::regclass AND tgname='zz_delivery_mutation_closed' AND tgenabled='O') THEN RAISE EXCEPTION 'DELIVERY_CAP_POST_BARRIER'; END IF;",
             "IF (SELECT prosecdef FROM pg_proc WHERE oid=to_regprocedure('public.rpc_entrega_operacoes_capability_v1()')) IS NOT TRUE OR NOT (SELECT 'search_path=\"\"'=ANY(proconfig) FROM pg_proc WHERE oid=to_regprocedure('public.rpc_entrega_operacoes_capability_v1()')) THEN RAISE EXCEPTION 'DELIVERY_CAP_POST_DEFINER'; END IF;"]
    blk = lambda name, lines: f"DO $pre$ BEGIN\n-- {name}\n" + "\n".join(lines) + "\nEND $pre$;\n"
    delta = CAP_BODY + f"""
REVOKE ALL ON FUNCTION {CAP} FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION {CAP} TO authenticated;
GRANT EXECUTE ON FUNCTION {GROUP} TO authenticated;
GRANT EXECUTE ON FUNCTION {CANCEL} TO authenticated;
"""
    (H / 'preflight.sql.review').write_text(blk('PRE', pre))
    (H / 'postflight.sql.review').write_text(blk('POST', post))
    (H / 'delta.sql.review').write_text(delta)
    (H / 'install.sql.review').write_text("BEGIN;\nSET LOCAL lock_timeout='3s';\nSET LOCAL statement_timeout='30s';\n" + blk('PRE', pre) + delta + blk('POST', post) + "COMMIT;\n")
    (H / 'rollback.sql.review').write_text(f"""BEGIN;
SET LOCAL lock_timeout='3s';
-- Deny-only: close grants, keep functions/receipts/barrier/history; never reopen legacy or DML.
REVOKE EXECUTE ON FUNCTION {GROUP} FROM PUBLIC,anon,authenticated,service_role;
REVOKE EXECUTE ON FUNCTION {CANCEL} FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.rpc_entrega_operacoes_capability_v1()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
BEGIN RETURN jsonb_build_object('capability','delivery_operations_v1','group',false,'cancel',false); END $$;
DO $post$ BEGIN
 IF has_function_privilege('authenticated','{GROUP}','EXECUTE') OR has_function_privilege('authenticated','{CANCEL}','EXECUTE') THEN RAISE EXCEPTION 'DELIVERY_CAP_ROLLBACK_OPEN'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.entregas'::regclass AND tgname='zz_delivery_mutation_closed' AND tgenabled='O') THEN RAISE EXCEPTION 'DELIVERY_CAP_ROLLBACK_BARRIER'; END IF;
END $post$;
COMMIT;
""")
if __name__ == '__main__':
    build(); print('assembled')
