#!/usr/bin/env python3
"""Gera 01-pre/02-install/03-post/04-rollback (conferência/instalação) e 05/06 (habilitação/desligamento do piloto, separados)
a partir de candidate.sql, com pins MD5 fixados aqui. Arquivos finais sem placeholders. Nunca executa nada hospedado.
  python3 generate.py            -> escreve arquivos + SHA256SUMS
  python3 generate.py --verify   -> confere bytes em disco = renderização (exit 1 se divergir)"""
import hashlib,json,sys
from pathlib import Path
H=Path(__file__).resolve().parent
REF='swzpzcwiasxmjutrmvkm'
# Pins das dependências medidos no espelho compatível (corpos LIVE capturados/compostos). O auditor confere com a produção
# antes do PRE; qualquer divergência faz o PRE falhar fechado.
DEPS={"public.approve_partner_order(uuid,text,date)":"0d3b85049e3b3b799ba81b4cb95be0da",
"public.approve_b2b_credit(uuid,text)":"26c77e55dfcb2b48fdb63cbc5b2819ed",
"public.approve_b2b_payment_terms_secure(uuid,text)":"28e65625e0a481b93af85cc37cb0af5f",
"platform_private.c2_accounting_pending_guard()":"669b19490a7a9700f0158db4b31885ad",
"platform_private.b2b_financial_forecast_after_approval_v1(uuid,jsonb)":"80c808dd095746213ddb37fbca44b525",
"platform_private.c2_external_origin_contract_valid(jsonb)":"369fd07cd9c659b87941b9a3bf972868",
"platform_private.c2p1_internal_actor(public.app_role[])":"97bab97591a9f662bad7b1ccf837bfcd",
"public.respond_b2b_order_quote_secure(uuid,jsonb,date,integer,text)":"97bcdb9884b54adb3bd4aae4915e32d0",
"platform_private.b2b_financial_forecast_guard()":"2a28194f419c5e7627cb9ec04bb8bebe",
"platform_private.has_ticket(text,uuid)":"29adae3347e8a5ff23327fa86fceb54b",
"public.get_b2b_financial_forecast_secure(uuid)":"c0d3cfff6ef757498b27009ae50950c3",
"public.h15_actor_organization()":"55edafec08bcc84a00f1526c14334a2c"}
CAND=json.loads((H/'candidate-md5.json').read_text()) if (H/'candidate-md5.json').exists() else {}
PUBLIC_RPCS=['public.c2_pilot_economic_approve_v1(uuid,text,text,text,text)','public.c2_pilot_economic_state_v1(uuid)']
CORE='platform_private.c2_pilot_econ_approve_core_v1(uuid,text,text,text,text)'
TABLES=['platform_private.c2_pilot_econ_gate_v1','platform_private.c2_pilot_econ_allowlist_v1','platform_private.c2_pilot_econ_approvals_v1']
FILES=['01-pre.sql.readonly','02-install.sql.review','03-post.sql.readonly','04-rollback-deny.sql.review','05-pilot-enable.sql.review','06-pilot-disable.sql.review']
def refcheck(tag): return f"DO $$BEGIN IF current_setting('c2pilot.expected_ref',true) IS DISTINCT FROM '{REF}' THEN RAISE EXCEPTION '{tag}_REF_UNPROVEN';END IF;END$$;\n"
def dep_checks(tag):
    return "DO $$BEGIN\n"+"".join(f" IF md5(pg_get_functiondef('{s}'::regprocedure)) IS DISTINCT FROM '{m}' THEN RAISE EXCEPTION '{tag}_DEP_DRIFT:{s}';END IF;\n" for s,m in DEPS.items())+"END$$;\n"
def absent(tag):
    return ("DO $$BEGIN\n"+"".join(f" IF to_regclass('{t}') IS NOT NULL THEN RAISE EXCEPTION '{tag}_ALREADY_PRESENT:{t}';END IF;\n" for t in TABLES)
            +"".join(f" IF to_regprocedure('{s}') IS NOT NULL THEN RAISE EXCEPTION '{tag}_ALREADY_PRESENT:{s}';END IF;\n" for s in CAND)+"END$$;\n")
def cand_checks(tag):
    return "DO $$BEGIN\n"+"".join(f" IF to_regprocedure('{s}') IS NULL OR md5(pg_get_functiondef('{s}'::regprocedure)) IS DISTINCT FROM '{m}' THEN RAISE EXCEPTION '{tag}_CANDIDATE_DRIFT:{s}';END IF;\n" for s,m in CAND.items())+"END$$;\n"
ACL_SQL=lambda s: f"(SELECT coalesce(string_agg(x.grantee::regrole::text||':'||x.privilege_type||':'||x.is_grantable::text,',' ORDER BY 1),'') FROM pg_proc p,aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))x WHERE p.oid='{s}'::regprocedure AND x.grantee<>0)||'|'||(SELECT proowner::regrole::text FROM pg_proc WHERE oid='{s}'::regprocedure)"
def acl_checks(tag,open_):
    want_pub='authenticated:EXECUTE:false,postgres:EXECUTE:false|postgres' if open_ else 'postgres:EXECUTE:false|postgres'
    out="DO $$BEGIN\n"
    for s in PUBLIC_RPCS+[CORE]: out+=f" IF {ACL_SQL(s)} IS DISTINCT FROM '{want_pub}' THEN RAISE EXCEPTION '{tag}_ACL_DRIFT:{s}';END IF;\n"
    for s in [x for x in CAND if x not in PUBLIC_RPCS+[CORE]]: out+=f" IF {ACL_SQL(s)} IS DISTINCT FROM 'postgres:EXECUTE:false|postgres' THEN RAISE EXCEPTION '{tag}_ACL_DRIFT:{s}';END IF;\n"
    for t in TABLES: out+=f" IF has_table_privilege('authenticated','{t}','SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('anon','{t}','SELECT') OR has_table_privilege('service_role','{t}','SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION '{tag}_TABLE_ACL_DRIFT:{t}';END IF;\n"
    out+=f" IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='platform_private.b2b_financial_forecasts'::regclass AND tgname='c2_pilot_forecast_insert_barrier' AND tgenabled='O') THEN RAISE EXCEPTION '{tag}_BARRIER_MISSING';END IF;\n"
    out+=f" IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='platform_private.c2_pilot_econ_approvals_v1'::regclass AND tgname='c2_pilot_econ_approvals_no_change' AND tgenabled='O') THEN RAISE EXCEPTION '{tag}_IMMUTABLE_MISSING';END IF;\n"
    return out+"END$$;\n"
def render():
    src=(H/'candidate.sql').read_text().rstrip()+"\n"
    assert '{' not in ''.join(DEPS) and CAND,'run measure first'
    pre="-- READ-ONLY PRE. Executar com: SET c2pilot.expected_ref='swzpzcwiasxmjutrmvkm';\nBEGIN READ ONLY;\n"+refcheck('C2PILOT_PRE')+dep_checks('C2PILOT_PRE')+absent('C2PILOT_PRE')+"SELECT 'C2PILOT_PRE_PASS';\nROLLBACK;\n"
    inst=("-- INSTALL (transação única). Somente pelo auditor após aprovação dos testes. Instala FECHADO (gate false, allowlist vazia).\nBEGIN;\nSET LOCAL lock_timeout='3s';\n"
          +refcheck('C2PILOT_INSTALL')+dep_checks('C2PILOT_INSTALL')+absent('C2PILOT_INSTALL')+src+cand_checks('C2PILOT_INSTALL')+acl_checks('C2PILOT_INSTALL',True)+dep_checks('C2PILOT_INSTALL_POST')
          +"DO $$BEGIN IF (SELECT enabled FROM platform_private.c2_pilot_econ_gate_v1) IS NOT FALSE OR EXISTS(SELECT 1 FROM platform_private.c2_pilot_econ_allowlist_v1) THEN RAISE EXCEPTION 'C2PILOT_INSTALL_NOT_CLOSED';END IF;END$$;\nCOMMIT;\n")
    post="-- READ-ONLY POST.\nBEGIN READ ONLY;\n"+cand_checks('C2PILOT_POST')+acl_checks('C2PILOT_POST',True)+dep_checks('C2PILOT_POST')+"SELECT 'C2PILOT_POST_PASS';\nROLLBACK;\n"
    rb=("-- ROLLBACK deny-only: fecha gate, revoga allowlist e EXECUTE das RPCs novas; preserva ledger, previsões, eventos e a barreira.\nBEGIN;\nSET LOCAL lock_timeout='3s';\n"
        +refcheck('C2PILOT_ROLLBACK')+cand_checks('C2PILOT_ROLLBACK')
        +"UPDATE platform_private.c2_pilot_econ_gate_v1 SET enabled=false,updated_at=now(),reason='ROLLBACK_DENY' WHERE singleton;\n"
        +"UPDATE platform_private.c2_pilot_econ_allowlist_v1 SET revoked_at=greatest(now(),valid_from),revoke_reason='ROLLBACK_DENY' WHERE revoked_at IS NULL;\n"
        +"".join(f"REVOKE ALL ON FUNCTION {s} FROM PUBLIC,anon,authenticated,service_role;\n" for s in PUBLIC_RPCS+[CORE])
        +cand_checks('C2PILOT_ROLLBACK_POST')+acl_checks('C2PILOT_ROLLBACK_POST',False)
        +"DO $$BEGIN IF (SELECT enabled FROM platform_private.c2_pilot_econ_gate_v1) IS NOT FALSE OR EXISTS(SELECT 1 FROM platform_private.c2_pilot_econ_allowlist_v1 WHERE revoked_at IS NULL) THEN RAISE EXCEPTION 'C2PILOT_ROLLBACK_NOT_CLOSED';END IF;END$$;\nSELECT 'C2PILOT_ROLLBACK_PASS';\nCOMMIT;\n")
    en=("-- HABILITAÇÃO DO PILOTO (separada da conferência). Requer settings explícitos (não interpolação):\n"
        "--  SET c2pilot.expected_ref='swzpzcwiasxmjutrmvkm'; SET c2pilot.order_id='<uuid completo>'; SET c2pilot.commercial_actor='<uuid>';\n"
        "--  SET c2pilot.credit_actor='<uuid>'; SET c2pilot.hours='4'; SET c2pilot.reason='<motivo>';\n"
        "-- Falha fechada se o pedido não for C2 pendente contábil com evidência completa, ator sem perfil competente/ativo no tenant, ou pacote divergente.\nBEGIN;\nSET LOCAL lock_timeout='3s';\n"
        +refcheck('C2PILOT_ENABLE')+cand_checks('C2PILOT_ENABLE')+acl_checks('C2PILOT_ENABLE',True)+
        """DO $$DECLARE o uuid:=nullif(current_setting('c2pilot.order_id',true),'')::uuid;ca uuid:=nullif(current_setting('c2pilot.commercial_actor',true),'')::uuid;
 ka uuid:=nullif(current_setting('c2pilot.credit_actor',true),'')::uuid;h integer:=nullif(current_setting('c2pilot.hours',true),'')::integer;rs text:=current_setting('c2pilot.reason',true);
 po public.partner_orders;org uuid;ev jsonb;
BEGIN
 IF o IS NULL OR ca IS NULL OR ka IS NULL OR h IS NULL OR h NOT BETWEEN 1 AND 24 OR coalesce(length(btrim(rs)),0)<5 THEN RAISE EXCEPTION 'C2PILOT_ENABLE_PARAMS_REQUIRED';END IF;
 SELECT * INTO po FROM public.partner_orders WHERE id=o FOR UPDATE;
 SELECT pa.commercial_owner_organization_id INTO org FROM public.partner_accounts pa WHERE pa.id=po.partner_id AND pa.ativo IS TRUE AND pa.deleted_at IS NULL;
 IF org IS NULL THEN RAISE EXCEPTION 'C2PILOT_ENABLE_SCOPE';END IF;
 ev:=platform_private.c2_pilot_econ_evidence_v1(o);
 IF NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=ca AND p.ativo AND p.organization_id=org) OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=ca AND role IN ('administrador','gestor_comercial'))
  OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=ca AND role IN ('vendedor','parceiro_b2b','parceiro_b2b_tecnico','cliente_produtor')) THEN RAISE EXCEPTION 'C2PILOT_ENABLE_COMMERCIAL_ACTOR_INVALID';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=ka AND p.ativo AND p.organization_id=org) OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=ka AND role IN ('administrador','financeiro'))
  OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=ka AND role IN ('vendedor','parceiro_b2b','parceiro_b2b_tecnico','cliente_produtor')) THEN RAISE EXCEPTION 'C2PILOT_ENABLE_CREDIT_ACTOR_INVALID';END IF;
 INSERT INTO platform_private.c2_pilot_econ_allowlist_v1(order_id,organization_id,partner_id,actor_id,kind,valid_until,reason)
 VALUES(o,org,po.partner_id,ca,'commercial',now()+make_interval(hours=>h),rs),(o,org,po.partner_id,ka,'credit',now()+make_interval(hours=>h),rs);
 UPDATE platform_private.c2_pilot_econ_gate_v1 SET enabled=true,updated_at=now(),reason='PILOT_ENABLED:'||rs WHERE singleton;
 RAISE NOTICE 'C2PILOT_ENABLE_EVIDENCE_HASH %',ev->>'evidence_hash';
END$$;
SELECT 'C2PILOT_ENABLE_PASS';
COMMIT;
""")
    dis=("-- DESLIGAMENTO DO PILOTO: gate false e revogação das concessões vigentes; ledger/previsões preservados.\nBEGIN;\n"+refcheck('C2PILOT_DISABLE')
         +"UPDATE platform_private.c2_pilot_econ_gate_v1 SET enabled=false,updated_at=now(),reason='PILOT_DISABLED' WHERE singleton;\n"
         +"UPDATE platform_private.c2_pilot_econ_allowlist_v1 SET revoked_at=greatest(now(),valid_from),revoke_reason='PILOT_DISABLED' WHERE revoked_at IS NULL;\nSELECT 'C2PILOT_DISABLE_PASS';\nCOMMIT;\n")
    return dict(zip(FILES,[pre,inst,post,rb,en,dis]))
def sha(b): return hashlib.sha256(b).hexdigest()
def verify_on_disk():
    r=render();out={}
    for n,t in r.items():
        b=(H/n).read_bytes()
        if b!=t.encode(): raise SystemExit(f'DISK_DRIFT {n}')
        out[n]=sha(b)
    return out
if __name__=='__main__':
    if '--verify' in sys.argv: print(json.dumps(verify_on_disk(),indent=1));sys.exit(0)
    r=render()
    for n,t in r.items(): (H/n).write_text(t)
    files=FILES+['candidate.sql','candidate-md5.json','generate.py','fixture.py','test_pilot_pg.py']
    (H/'SHA256SUMS').write_text(''.join(f"{sha((H/n).read_bytes())}  {n}\n" for n in files if (H/n).exists()))
    print('written')
