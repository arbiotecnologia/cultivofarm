"""Gera preflight/candidate/postflight/rollbacks a partir da captura LIVE byte-exata.
INATIVO: nenhum arquivo aqui é aplicado automaticamente. Pins LIVE capturados READ ONLY
em 26/10/2026 (ref swzpzcwiasxmjutrmvkm) via consulta somente leitura."""
from pathlib import Path
import hashlib, json
D = Path(__file__).resolve().parent
LIVE_BODY = (D / 'live/create_partner_order_secure.prosrc').read_text()
assert hashlib.md5(LIVE_BODY.encode()).hexdigest() == '7a63423519d7d9a54ced52d6d9e9e057'
PINS = json.loads((D / 'live-pins.json').read_text())
EXP_PATH = D / 'expected.json'
EXP = json.loads(EXP_PATH.read_text()) if EXP_PATH.exists() else {}

CREATE_SIG = 'public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)'
CREATE_HDR = """CREATE OR REPLACE FUNCTION public.create_partner_order_secure(p_partner_id uuid, p_observacoes text DEFAULT NULL::text, p_items jsonb DEFAULT '[]'::jsonb, p_requested_delivery_date date DEFAULT NULL::date, p_payment_plan_id uuid DEFAULT NULL::uuid, p_first_due_date date DEFAULT NULL::date, p_installment_count integer DEFAULT NULL::integer, p_expected_cart_hash text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$"""
ANCHOR = "  PERFORM pg_advisory_xact_lock(hashtextextended('b2b_idem:' || p_partner_id::text || ':' || v_idem, 0));\n"
assert LIVE_BODY.count(ANCHOR) == 1
PATCH = ANCHOR + """  -- c2_attempt_closure_v2: a espera no lock pode atravessar revogações; revalida a
  -- autorização canônica APÓS o lock e antes de revelar replay ou criar (ponto de
  -- linearização = esta instrução; revogação confirmada depois dela não é observada).
  PERFORM platform_private.c2_partner_order_attempt_authz(v_uid, p_partner_id);
  -- Fechamento durável sob ESTE MESMO lock: recusa envio tardio antes de qualquer efeito.
  -- (Corpos antigos em voo são cobertos pelo trigger c2_attempt_closure_guard.)
  IF EXISTS (SELECT 1 FROM platform_private.partner_order_idempotency_closures c
              WHERE c.partner_id = p_partner_id AND c.idempotency_key = v_idem) THEN
    RAISE EXCEPTION 'idempotency_key_closed';
  END IF;
"""
PATCHED_BODY = LIVE_BODY.replace(ANCHOR, PATCH, 1)

AUTHZ = """
DECLARE
  v_is_internal boolean; v_is_partner boolean; v_is_partner_tech boolean; v_user_partner uuid;
BEGIN
  -- Espelha a autorização do create canônico (mesma ordem/mensagens). Chamado antes E
  -- depois do lock b2b_idem; cada chamada lê um snapshot novo (READ COMMITTED).
  IF p_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  PERFORM platform_private.c2_order_actor_scope(p_uid, p_partner_id);
  v_is_internal := public.has_role(p_uid,'administrador'::public.app_role)
                OR public.has_role(p_uid,'financeiro'::public.app_role)
                OR public.has_role(p_uid,'gestor_comercial'::public.app_role);
  v_is_partner      := public.has_role(p_uid,'parceiro_b2b'::public.app_role);
  v_is_partner_tech := public.has_role(p_uid,'parceiro_b2b_tecnico'::public.app_role);
  v_user_partner    := public.get_user_partner_id();
  IF public.has_role(p_uid,'cliente_produtor'::public.app_role) AND NOT (v_is_internal OR v_is_partner) THEN
    RAISE EXCEPTION 'PRODUCER_DIRECT_NOT_ENABLED';
  END IF;
  IF v_is_partner_tech AND NOT (v_is_internal OR v_is_partner) THEN
    RAISE EXCEPTION 'partner_tech_cannot_create_order';
  END IF;
  IF NOT v_is_internal THEN
    IF NOT v_is_partner OR v_user_partner IS NULL OR v_user_partner <> p_partner_id THEN
      RAISE EXCEPTION 'forbidden_partner';
    END IF;
  END IF;
  PERFORM 1 FROM public.partner_accounts WHERE id = p_partner_id AND ativo = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'partner_not_found'; END IF;
END;
"""
CORE = """
DECLARE
  v_uid uuid := auth.uid();
  v_idem text;
  v_found boolean; v_order_id uuid; v_numero text;
BEGIN
  -- Autorização canônica ANTES do lock e de revelar qualquer estado.
  PERFORM platform_private.c2_partner_order_attempt_authz(v_uid, p_partner_id);
  v_idem := NULLIF(btrim(COALESCE(p_idempotency_key,'')),'');
  IF v_idem IS NULL THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  IF length(v_idem) > 120 THEN RAISE EXCEPTION 'invalid_idempotency_key'; END IF;

  -- MESMO lock do create. Espera limitada (lock_timeout da função): estouro => in_progress,
  -- nunca conclusivo e sem nenhuma escrita.
  BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended('b2b_idem:' || p_partner_id::text || ':' || v_idem, 0));
  EXCEPTION WHEN lock_not_available THEN
    RETURN jsonb_build_object('contract','C2_ORDER_ATTEMPT_CLOSURE_V1','state','in_progress');
  END;

  -- Revalida APÓS a espera: revogação/perfil/parceiro inativo confirmados durante a espera
  -- abortam sem revelar committed e sem gravar closed.
  PERFORM platform_private.c2_partner_order_attempt_authz(v_uid, p_partner_id);

  SELECT true, i.order_id INTO v_found, v_order_id
    FROM public.partner_order_idempotency i
   WHERE i.partner_id = p_partner_id AND i.idempotency_key = v_idem;
  IF v_found THEN
    SELECT o.numero INTO v_numero FROM public.partner_orders o WHERE o.id = v_order_id;
    RETURN jsonb_build_object('contract','C2_ORDER_ATTEMPT_CLOSURE_V1','state','committed',
                              'order_id', v_order_id, 'numero', v_numero);
  END IF;

  INSERT INTO platform_private.partner_order_idempotency_closures(partner_id, idempotency_key, closed_by, closed_org)
  VALUES (p_partner_id, v_idem, v_uid,
          (SELECT p.organization_id FROM public.profiles p WHERE p.user_id = v_uid))
  ON CONFLICT (partner_id, idempotency_key) DO NOTHING;
  RETURN jsonb_build_object('contract','C2_ORDER_ATTEMPT_CLOSURE_V1','state','closed');
END;
"""
GUARD = """
DECLARE v_key text := btrim(NEW.idempotency_key);
BEGIN
  -- Barreira durável no caminho de ESCRITA: cobre corpos antigos de create ainda em voo
  -- durante o rollout (CREATE OR REPLACE não drena execuções já iniciadas). Mesmo lock
  -- b2b_idem (reentrante para quem já o detém) + recusa se a chave foi fechada.
  PERFORM pg_advisory_xact_lock(hashtextextended('b2b_idem:' || NEW.partner_id::text || ':' || v_key, 0));
  IF EXISTS (SELECT 1 FROM platform_private.partner_order_idempotency_closures c
              WHERE c.partner_id = NEW.partner_id AND c.idempotency_key = v_key) THEN
    RAISE EXCEPTION 'idempotency_key_closed';
  END IF;
  RETURN NEW;
END;
"""
WRAPPER = """
  SELECT platform_private.c2_close_partner_order_attempt_core(p_partner_id, p_idempotency_key);
"""
IMMUT = """
BEGIN
  RAISE EXCEPTION 'C2_ATTEMPT_CLOSURE_IMMUTABLE' USING ERRCODE = '42501';
END;
"""
CORE_SIG = 'platform_private.c2_close_partner_order_attempt_core(uuid,text)'
WRAP_SIG = 'public.close_partner_order_attempt_v1(uuid,text)'
IMMUT_SIG = 'platform_private.c2_attempt_closure_immutable()'
AUTHZ_SIG = 'platform_private.c2_partner_order_attempt_authz(uuid,uuid)'
GUARD_SIG = 'platform_private.c2_attempt_closure_guard()'
TIMEOUTS = "SET LOCAL lock_timeout = '5s';\nSET LOCAL statement_timeout = '60s';\n"
md5 = lambda s: hashlib.md5(s.encode()).hexdigest()
H = {CREATE_SIG: md5(PATCHED_BODY), CORE_SIG: md5(CORE), WRAP_SIG: md5(WRAPPER), IMMUT_SIG: md5(IMMUT), AUTHZ_SIG: md5(AUTHZ), GUARD_SIG: md5(GUARD)}

def fn(sig): return f"(SELECT p FROM pg_proc p WHERE p.oid = to_regprocedure('{sig}'))"

def live_asserts(tag):
    p = PINS
    return f"""
DO ${tag}$
DECLARE r record;
BEGIN
  -- alvo ausente
  IF to_regclass('platform_private.partner_order_idempotency_closures') IS NOT NULL
     OR to_regprocedure('{CORE_SIG}') IS NOT NULL OR to_regprocedure('{WRAP_SIG}') IS NOT NULL
     OR to_regprocedure('{IMMUT_SIG}') IS NOT NULL OR to_regprocedure('{AUTHZ_SIG}') IS NOT NULL
     OR to_regprocedure('{GUARD_SIG}') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.partner_order_idempotency'::regclass AND tgname='c2_attempt_closure_guard') THEN
    RAISE EXCEPTION 'C2AC_TARGET_PRESENT';
  END IF;
  -- create canônico LIVE byte-exato (corpo/owner/secdef/search_path/ACL)
  SELECT md5(prosrc) m, pg_get_userbyid(proowner) o, prosecdef s, proconfig c, proacl::text a INTO r
    FROM pg_proc WHERE oid = to_regprocedure('{CREATE_SIG}');
  IF r.m IS DISTINCT FROM '{p['create_prosrc_md5']}' OR r.o IS DISTINCT FROM 'postgres' OR r.s IS DISTINCT FROM true
     OR r.c IS DISTINCT FROM ARRAY['search_path=public']::text[] OR r.a IS DISTINCT FROM '{p['create_acl']}' THEN
    RAISE EXCEPTION 'C2AC_DRIFT:create_partner_order_secure';
  END IF;
  -- dependências usadas pelo core
  IF (SELECT md5(pg_get_functiondef(oid))||' '||proacl::text FROM pg_proc WHERE oid = to_regprocedure('platform_private.c2_order_actor_scope(uuid,uuid)'))
     IS DISTINCT FROM '{p['scope']}' THEN RAISE EXCEPTION 'C2AC_DRIFT:c2_order_actor_scope'; END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure('public.has_role(uuid,public.app_role)'))
     IS DISTINCT FROM '{p['has_role_prosrc_md5']}' THEN RAISE EXCEPTION 'C2AC_DRIFT:has_role'; END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure('public.get_user_partner_id()'))
     IS DISTINCT FROM '{p['get_user_partner_id_prosrc_md5']}' THEN RAISE EXCEPTION 'C2AC_DRIFT:get_user_partner_id'; END IF;
  -- tabela de idempotência: colunas, RLS, policies e índice único exato
  IF (SELECT md5(string_agg(attname||':'||format_type(atttypid,atttypmod)||':'||attnotnull,',' ORDER BY attnum))
        FROM pg_attribute WHERE attrelid='public.partner_order_idempotency'::regclass AND attnum>0 AND NOT attisdropped)
     IS DISTINCT FROM '{p['poi_cols']}' THEN RAISE EXCEPTION 'C2AC_DRIFT:poi_columns'; END IF;
  IF (SELECT md5(string_agg(policyname||'|'||permissive||'|'||cmd||'|'||array_to_string(roles,',')||'|'||coalesce(qual,'')||'|'||coalesce(with_check,''),'#' ORDER BY policyname))
        FROM pg_policies WHERE schemaname='public' AND tablename='partner_order_idempotency')
     IS DISTINCT FROM '{p['poi_policies']}' THEN RAISE EXCEPTION 'C2AC_DRIFT:poi_policies'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.partner_order_idempotency'::regclass AND relrowsecurity) THEN
    RAISE EXCEPTION 'C2AC_DRIFT:poi_rls'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
     WHERE i.indrelid='public.partner_order_idempotency'::regclass AND c.relname='ux_partner_order_idempotency_key'
       AND i.indisunique AND i.indisvalid AND i.indisready AND i.indpred IS NULL AND i.indexprs IS NULL
       AND (SELECT array_agg(a.attname ORDER BY k.ord) FROM unnest(i.indkey) WITH ORDINALITY k(attnum,ord)
              JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum) = ARRAY['partner_id','idempotency_key']::name[]) THEN
    RAISE EXCEPTION 'C2AC_DRIFT:poi_unique_key'; END IF;
  IF NOT has_schema_privilege('authenticated','platform_private','USAGE') THEN RAISE EXCEPTION 'C2AC_DRIFT:pp_usage'; END IF;
END ${tag}$;
"""

def post_asserts(tag):
    return f"""
DO ${tag}$
DECLARE r record;
BEGIN
  SELECT md5(prosrc) m, pg_get_userbyid(proowner) o, prosecdef s, proconfig c, proacl::text a INTO r FROM pg_proc WHERE oid=to_regprocedure('{CREATE_SIG}');
  IF r.m IS DISTINCT FROM '{H[CREATE_SIG]}' OR r.o<>'postgres' OR NOT r.s OR r.c IS DISTINCT FROM ARRAY['search_path=public']::text[] OR r.a IS DISTINCT FROM '{PINS['create_acl']}' THEN
    RAISE EXCEPTION 'C2AC_POST:create'; END IF;
  SELECT md5(prosrc) m, pg_get_userbyid(proowner) o, prosecdef s, proconfig c, proacl::text a INTO r FROM pg_proc WHERE oid=to_regprocedure('{CORE_SIG}');
  IF r.m IS DISTINCT FROM '{H[CORE_SIG]}' OR r.o<>'postgres' OR NOT r.s
     OR r.c IS DISTINCT FROM ARRAY['search_path=""','lock_timeout=5s']::text[]
     OR r.a IS DISTINCT FROM '{{postgres=X/postgres,authenticated=X/postgres}}' THEN RAISE EXCEPTION 'C2AC_POST:core'; END IF;
  SELECT md5(prosrc) m, pg_get_userbyid(proowner) o, prosecdef s, proconfig c, proacl::text a INTO r FROM pg_proc WHERE oid=to_regprocedure('{WRAP_SIG}');
  IF r.m IS DISTINCT FROM '{H[WRAP_SIG]}' OR r.o<>'postgres' OR r.s
     OR r.c IS DISTINCT FROM ARRAY['search_path=""']::text[]
     OR r.a IS DISTINCT FROM '{{postgres=X/postgres,authenticated=X/postgres}}' THEN RAISE EXCEPTION 'C2AC_POST:wrapper'; END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('{IMMUT_SIG}')) IS DISTINCT FROM '{H[IMMUT_SIG]}' THEN RAISE EXCEPTION 'C2AC_POST:immutable_fn'; END IF;
  IF has_function_privilege('anon','{WRAP_SIG}','EXECUTE') OR has_function_privilege('anon','{CORE_SIG}','EXECUTE')
     OR has_function_privilege('service_role','{CORE_SIG}','EXECUTE') THEN RAISE EXCEPTION 'C2AC_POST:exec_privileges'; END IF;
  IF (SELECT relacl::text FROM pg_class WHERE oid='platform_private.partner_order_idempotency_closures'::regclass) IS DISTINCT FROM '{{postgres=arwdDxtm/postgres,service_role=r/postgres}}'
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='platform_private.partner_order_idempotency_closures'::regclass)
     OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='platform_private' AND tablename='partner_order_idempotency_closures') THEN
    RAISE EXCEPTION 'C2AC_POST:closures_acl_rls'; END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid='platform_private.partner_order_idempotency_closures'::regclass AND NOT tgisinternal
        AND tgfoid=to_regprocedure('{IMMUT_SIG}')) <> 2 THEN RAISE EXCEPTION 'C2AC_POST:immutability_triggers'; END IF;
  SELECT md5(prosrc) m, pg_get_userbyid(proowner) o, prosecdef s, proconfig c, proacl::text a INTO r FROM pg_proc WHERE oid=to_regprocedure('{AUTHZ_SIG}');
  IF r.m IS DISTINCT FROM '{H[AUTHZ_SIG]}' OR r.o<>'postgres' OR r.s OR r.c IS DISTINCT FROM ARRAY['search_path=""']::text[]
     OR r.a IS DISTINCT FROM '{{postgres=X/postgres}}' THEN RAISE EXCEPTION 'C2AC_POST:authz'; END IF;
  SELECT md5(prosrc) m, pg_get_userbyid(proowner) o, prosecdef s, proconfig c, proacl::text a INTO r FROM pg_proc WHERE oid=to_regprocedure('{GUARD_SIG}');
  IF r.m IS DISTINCT FROM '{H[GUARD_SIG]}' OR r.o<>'postgres' OR NOT r.s OR r.c IS DISTINCT FROM ARRAY['search_path=""']::text[]
     OR r.a IS DISTINCT FROM '{{postgres=X/postgres}}' THEN RAISE EXCEPTION 'C2AC_POST:guard_fn'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.partner_order_idempotency'::regclass AND tgname='c2_attempt_closure_guard'
        AND tgfoid=to_regprocedure('{GUARD_SIG}') AND tgenabled='O' AND NOT tgisinternal
        AND tgtype = (1|2|4|16)::int2) THEN RAISE EXCEPTION 'C2AC_POST:write_barrier_trigger'; END IF;
END ${tag}$;
"""

def fbody(hdr, body): return f"{hdr}{body}$function$;\n"

DDL = f"""
CREATE TABLE platform_private.partner_order_idempotency_closures (
  partner_id uuid NOT NULL REFERENCES public.partner_accounts(id),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 120 AND idempotency_key = btrim(idempotency_key)),
  closed_by uuid NOT NULL,
  closed_org uuid,
  closed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (partner_id, idempotency_key)
);
COMMENT ON TABLE platform_private.partner_order_idempotency_closures IS
  'C2_ORDER_ATTEMPT_CLOSURE_V1: fechamento duravel e imutavel de chave de idempotencia sem pedido; verificado pelo create sob o lock b2b_idem.';
ALTER TABLE platform_private.partner_order_idempotency_closures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform_private.partner_order_idempotency_closures FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON platform_private.partner_order_idempotency_closures TO service_role;

CREATE FUNCTION platform_private.c2_attempt_closure_immutable() RETURNS trigger
 LANGUAGE plpgsql SET search_path = '' AS $function${IMMUT}$function$;
REVOKE ALL ON FUNCTION platform_private.c2_attempt_closure_immutable() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER c2_attempt_closure_no_update_delete BEFORE UPDATE OR DELETE ON platform_private.partner_order_idempotency_closures
  FOR EACH ROW EXECUTE FUNCTION platform_private.c2_attempt_closure_immutable();
CREATE TRIGGER c2_attempt_closure_no_truncate BEFORE TRUNCATE ON platform_private.partner_order_idempotency_closures
  FOR EACH STATEMENT EXECUTE FUNCTION platform_private.c2_attempt_closure_immutable();

CREATE FUNCTION platform_private.c2_partner_order_attempt_authz(p_uid uuid, p_partner_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $function${AUTHZ}$function$;
REVOKE ALL ON FUNCTION platform_private.c2_partner_order_attempt_authz(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION platform_private.c2_attempt_closure_guard() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function${GUARD}$function$;
REVOKE ALL ON FUNCTION platform_private.c2_attempt_closure_guard() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER c2_attempt_closure_guard BEFORE INSERT OR UPDATE OF partner_id, idempotency_key ON public.partner_order_idempotency
  FOR EACH ROW EXECUTE FUNCTION platform_private.c2_attempt_closure_guard();

CREATE FUNCTION platform_private.c2_close_partner_order_attempt_core(p_partner_id uuid, p_idempotency_key text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '5s'
AS $function${CORE}$function$;
REVOKE ALL ON FUNCTION platform_private.c2_close_partner_order_attempt_core(uuid,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION platform_private.c2_close_partner_order_attempt_core(uuid,text) TO authenticated;

CREATE FUNCTION public.close_partner_order_attempt_v1(p_partner_id uuid, p_idempotency_key text)
 RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $function${WRAPPER}$function$;
REVOKE ALL ON FUNCTION public.close_partner_order_attempt_v1(uuid,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.close_partner_order_attempt_v1(uuid,text) TO authenticated;

{fbody(CREATE_HDR, PATCHED_BODY)}"""

HEAD = "-- INATIVO / REVISAO INDEPENDENTE. Nao aplicar sem autorizacao. Gerado por assemble.py.\n"
files = {
 'preflight.sql': HEAD + "-- READ ONLY: falha (rollback) em qualquer divergencia do LIVE capturado.\nBEGIN TRANSACTION READ ONLY;\n" + live_asserts('c2ac_pre') + "ROLLBACK;\n",
 'candidate.sql.review': HEAD + "-- Transacao unica: asserts LIVE antes do DDL; asserts POST antes do COMMIT.\nBEGIN;\n" + TIMEOUTS + live_asserts('c2ac_cand_pre') + DDL + post_asserts('c2ac_cand_post') + "COMMIT;\n",
 'postflight.sql': HEAD + "BEGIN TRANSACTION READ ONLY;\n" + post_asserts('c2ac_postflight') + "ROLLBACK;\n",
 # Contenção: NUNCA reabre chaves fechadas. Para novos fechamentos; tabela + guard do create permanecem.
 'rollback.sql.review': HEAD + """-- CONTENCAO (nao e reversao de codigo): impede NOVOS fechamentos e mantem
-- tabela, imutabilidade e guard do create — chaves ja fechadas continuam recusadas.
BEGIN;
""" + TIMEOUTS + post_asserts('c2ac_rb_pre') + f"""
REVOKE EXECUTE ON FUNCTION {WRAP_SIG.replace('(uuid,text)','(uuid,text)')} FROM authenticated;
REVOKE EXECUTE ON FUNCTION {CORE_SIG} FROM authenticated;
DO $c2ac_rb_post$ BEGIN
  IF has_function_privilege('authenticated','{WRAP_SIG}','EXECUTE') OR has_function_privilege('authenticated','{CORE_SIG}','EXECUTE')
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('{CREATE_SIG}')) IS DISTINCT FROM '{H[CREATE_SIG]}'
     OR to_regclass('platform_private.partner_order_idempotency_closures') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.partner_order_idempotency'::regclass AND tgname='c2_attempt_closure_guard' AND tgenabled='O') THEN
    RAISE EXCEPTION 'C2AC_ROLLBACK_POST'; END IF;
END $c2ac_rb_post$;
COMMIT;
""",
 # Remoção total somente se NENHUMA chave foi fechada (lock exclusivo + contagem zero).
 'rollback-full-if-empty.sql.review': HEAD + """-- Remocao total SOMENTE se nenhuma chave foi fechada; caso contrario aborta
-- (remover a tabela reabriria chaves fechadas e permitiria duplicata tardia).
BEGIN;
""" + TIMEOUTS + post_asserts('c2ac_full_pre') + f"""
LOCK TABLE platform_private.partner_order_idempotency_closures IN ACCESS EXCLUSIVE MODE;
DO $c2ac_full_empty$ BEGIN
  IF EXISTS (SELECT 1 FROM platform_private.partner_order_idempotency_closures) THEN
    RAISE EXCEPTION 'C2AC_FULL_ROLLBACK_REFUSED:closed_keys_exist';
  END IF;
END $c2ac_full_empty$;
{fbody(CREATE_HDR, LIVE_BODY)}
DROP FUNCTION public.close_partner_order_attempt_v1(uuid,text);
DROP FUNCTION platform_private.c2_close_partner_order_attempt_core(uuid,text);
DROP TRIGGER c2_attempt_closure_guard ON public.partner_order_idempotency;
DROP FUNCTION platform_private.c2_attempt_closure_guard();
DROP TABLE platform_private.partner_order_idempotency_closures;
DROP FUNCTION platform_private.c2_attempt_closure_immutable();
DROP FUNCTION platform_private.c2_partner_order_attempt_authz(uuid,uuid);
DO $c2ac_full_post$ BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('{CREATE_SIG}')) IS DISTINCT FROM '{PINS['create_prosrc_md5']}'
     OR (SELECT proacl::text FROM pg_proc WHERE oid=to_regprocedure('{CREATE_SIG}')) IS DISTINCT FROM '{PINS['create_acl']}'
     OR to_regclass('platform_private.partner_order_idempotency_closures') IS NOT NULL
     OR to_regprocedure('{AUTHZ_SIG}') IS NOT NULL OR to_regprocedure('{GUARD_SIG}') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.partner_order_idempotency'::regclass AND tgname='c2_attempt_closure_guard') THEN
    RAISE EXCEPTION 'C2AC_FULL_ROLLBACK_POST'; END IF;
END $c2ac_full_post$;
COMMIT;
""",
}
for name, text in files.items(): (D / name).write_text(text)
EXP.update({'candidate_prosrc_md5': H, 'live_pins': PINS})
EXP_PATH.write_text(json.dumps(EXP, indent=1) + '\n')
print(json.dumps(H, indent=1))
