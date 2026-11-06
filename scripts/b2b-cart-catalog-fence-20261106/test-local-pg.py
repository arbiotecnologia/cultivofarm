#!/usr/bin/env python3
"""PG DESCARTÁVEL — B2B_CART_CATALOG_FENCE_V1. Sem rede, sem sessão hospedada, sem writes remotos.

CORPOS REAIS carregados byte a byte (md5 conferido) de ./captured e de ../b2b-solid-packaging-order-20261106/captured:
  tenant_catalog_fence, catalog_tenant_actor, can_view_catalog_internal, fn_catalogo_preco_canonico (wrapper CERCADO),
  fn_catalogo_preco_canonico__tenant_core, fn_resolve_commercial_price, fn_resolve_b2b_cart, b2b_packaging_line,
  b2b_partner_catalog_reader, b2b_partner_catalog_item_price, get_partner_catalog_secure(uuid), c1b_catalog_visibility_scope,
  b2b_actor_scope, h15_actor_organization, get_user_partner_id, simulate_b2b_payment_plan_secure, recorte_a_legacy_solid,
  fn_b2b_cart_hash, fn_b2b_apply_interest.
COSTURAS DECLARADAS: auth.uid lê request.jwt.claims (sub) definido localmente; has_role/is_platform_superadmin/
  entitlements_for_user/_saas_user_has_feature/platform_actor_access_ready/is_valid_b2b_partner_user/catalog_tenant_seller/
  b2b_internal_commercial_actor/c2_internal_order_target_reason/c2_order_actor_scope/c2_owner_order_guard/fn_b2b_plan_selectable
  sobre tabelas mínimas; fn_b2b_credit_exposure lança (simulate já engole). NÃO é prova JWT/RLS/PostgREST hospedada.
Dados 100% sintéticos: vendedor "A" (papel AR Bio), segundo tenant "F", nenhum dado real.
"""
import hashlib, json, os, pathlib, shutil, subprocess, sys, tempfile, time

HERE = pathlib.Path(__file__).resolve().parent
CAPS = [HERE / "captured", HERE.parent / "b2b-solid-packaging-order-20261106" / "captured",
        HERE.parent / "b2b-solid-packaging-order-20261106" / "captured" / "credit"]
PORT = "55461"; SOCK = [""]


def u(n): return f"00000000-0000-0000-0000-{n:012d}"


A, F = u(1), u(2)
P, PO, PF = u(11), u(12), u(13)
UB, UT, UB2, UADM, UADMF, UINACT, UBF, USUP = (u(21), u(22), u(23), u(24), u(25), u(26), u(27), u(28))
LIQ, SOL, FLIQ, HID, MICRO = u(31), u(32), u(34), u(36), u(35)
VLIQ, PK25, VFLIQ, VHID, VMIC = u(41), u(51), u(42), u(43), u(44)
PLD = u(71)


def su(): return ["setpriv", "--reuid=1000", "--regid=1000", "--clear-groups"] if os.getuid() == 0 else []


def psql(sql, check=True):
    r = subprocess.run(su() + ["psql", "-X", "-q", "-t", "-A", "-h", SOCK[0], "-p", PORT, "-U", "postgres", "-d", "t", "-v", "ON_ERROR_STOP=1"],
                       input=sql, capture_output=True, text=True)
    if check and r.returncode != 0: raise RuntimeError(r.stderr)
    return r


def runfile(p):
    return subprocess.run(su() + ["psql", "-X", "-q", "-t", "-A", "-h", SOCK[0], "-p", PORT, "-U", "postgres", "-d", "t", "-v", "ON_ERROR_STOP=1", "-f", str(p)],
                          capture_output=True, text=True)


def cap(prefix):
    for d in CAPS:
        hits = [x for x in d.iterdir() if x.is_file() and x.name.startswith(prefix + ".")]
        if hits:
            [p] = hits; b = p.read_bytes(); assert hashlib.md5(b).hexdigest()[:8] == p.name.split(".")[-3], p.name
            return b.decode().rstrip("\n") + ";\n"
    raise FileNotFoundError(prefix)


def as_user(uid, sql, role="authenticated"):
    pre = f"SET ROLE {role};\n"
    if uid:
        claims = json.dumps({"sub": uid, "role": "authenticated", "exp": int(time.time()) + 3600, "iat": int(time.time()) - 5})
        pre += f"SELECT set_config('request.jwt.claims', '{claims}', false) \\g /dev/null\n"
    return psql(pre + sql, check=False)


SCHEMA = r"""
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth; CREATE SCHEMA platform_private;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role; GRANT USAGE ON SCHEMA platform_private TO authenticated, service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
 $$ SELECT NULLIF(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'sub', '')::uuid $$;
CREATE TYPE public.app_role AS ENUM ('administrador','gestor','gestor_comercial','financeiro','parceiro_b2b','parceiro_b2b_tecnico','cliente_produtor',
  'consultor_tecnico','tecnico_agronomo','operador_onfarm','producao','administrativo','superadmin');
CREATE TABLE public.organizations(id uuid PRIMARY KEY, ativo boolean, status text, partner_account_id uuid);
CREATE TABLE public.profiles(user_id uuid PRIMARY KEY, organization_id uuid, ativo boolean);
CREATE TABLE public.user_roles(user_id uuid, role public.app_role);
CREATE TABLE public.superadmins(user_id uuid);
CREATE TABLE public.partner_accounts(id uuid PRIMARY KEY, ativo boolean, deleted_at timestamptz, commercial_owner_organization_id uuid);
CREATE TABLE public.partner_users(user_id uuid, partner_id uuid, tenant_id uuid, revoked_at timestamptz, valid_from timestamptz);
CREATE TABLE public.produtos(id uuid PRIMARY KEY, nome text, codigo text, ativo boolean, b2b_enabled boolean, owner_organization_id uuid,
  valor_ha_brl numeric, dose_ml_ha numeric, valor_dose_brl numeric, valor_litro_brl numeric);
CREATE TABLE public.microrganismos(id uuid PRIMARY KEY, nome text, codigo text, ativo boolean, b2b_enabled boolean, owner_organization_id uuid,
  dose_ml_ha numeric, valor_dose_brl numeric, valor_litro_brl numeric);
CREATE TABLE public.product_technical_profiles(produto_id uuid, status_validacao text, resumo_curto text, explicacao_b2b text, beneficio_combinado text);
CREATE TABLE public.microorganism_technical_profiles(microrganismo_id uuid, status_validacao text, resumo_curto text, explicacao_b2b text, beneficios_agronomicos text);
CREATE TABLE public.catalog_tenant_visibility(organization_id uuid, entity_type text, hidden boolean, produto_id uuid, microrganismo_id uuid);
CREATE TABLE public.catalogo_volumes(id uuid PRIMARY KEY, produto_id uuid, microrganismo_id uuid, volume_ml numeric, preco_brl numeric NOT NULL DEFAULT 0,
  preco_litro_brl numeric, ativo boolean NOT NULL, owner_organization_id uuid NOT NULL, medida text NOT NULL);
CREATE TABLE public.product_sale_units(product_id uuid PRIMARY KEY, owner_organization_id uuid NOT NULL, unidade_conteudo text NOT NULL);
CREATE TABLE public.product_packagings(id uuid PRIMARY KEY, product_id uuid NOT NULL, owner_organization_id uuid NOT NULL, codigo text NOT NULL,
  peso_liquido_kg numeric NOT NULL, version integer NOT NULL DEFAULT 1, ativo boolean NOT NULL DEFAULT true, valid_from timestamptz NOT NULL DEFAULT now() - interval '1 day', valid_to timestamptz);
CREATE TABLE public.catalogo_precos_embalagem(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), produto_id uuid NOT NULL, owner_organization_id uuid NOT NULL,
  packaging_id uuid NOT NULL, preco_brl numeric NOT NULL, ativo boolean NOT NULL DEFAULT true, valid_from date NOT NULL DEFAULT CURRENT_DATE, valid_until date);
CREATE TABLE public.commercial_payment_plans(id uuid PRIMARY KEY, active boolean, pricing_mode text, discount_percent numeric, monthly_interest_percent numeric,
  months_count integer, interest_type text, installment_count integer, max_days integer, minimum_order_amount numeric, requires_financial_approval boolean,
  requires_guarantee boolean, requires_credit_approval boolean, name text, code text);
CREATE TABLE public.commercial_price_rules(id uuid PRIMARY KEY, active boolean, pricing_mode text, unit_type text, volume_ml numeric, product_id uuid, microrganismo_id uuid,
  valid_from date, valid_until date, buyer_scope text, partner_id uuid, customer_id uuid, plan_id uuid, min_quantity numeric, condition_price numeric, discount_percent numeric);
CREATE TABLE public.commercial_condition_item_prices(published_rule_id uuid);
CREATE TABLE public.commercial_payment_plan_assignments(status text, plan_id uuid, buyer_scope text, partner_id uuid, customer_id uuid, valid_from date, valid_until date);
CREATE TABLE public.partner_product_prices(partner_id uuid, ativo boolean, product_id uuid, microrganismo_id uuid, valid_from date, valid_until date, is_current boolean, preco_tabela numeric);
CREATE TABLE public.feature_grants(user_id uuid, feature_key text);

-- costuras declaradas
CREATE FUNCTION public.has_role(uuid, public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS
 $$ SELECT EXISTS (SELECT 1 FROM public.user_roles r JOIN public.profiles p ON p.user_id = r.user_id AND p.ativo WHERE r.user_id = $1 AND r.role = $2) $$;
CREATE FUNCTION platform_private.has_role(uuid, public.app_role) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT public.has_role($1, $2) $$;
CREATE FUNCTION public.is_platform_superadmin(uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS
 $$ SELECT EXISTS (SELECT 1 FROM public.superadmins s WHERE s.user_id = $1) $$;
CREATE FUNCTION platform_private.entitlements_for_user(uuid) RETURNS TABLE(feature_key text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS
 $$ SELECT g.feature_key FROM public.feature_grants g WHERE g.user_id = $1 $$;
CREATE FUNCTION public._saas_user_has_feature(uuid, text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS
 $$ SELECT EXISTS (SELECT 1 FROM public.feature_grants g WHERE g.user_id = $1 AND g.feature_key = $2) $$;
CREATE FUNCTION platform_private.platform_actor_access_ready(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE FUNCTION public.is_valid_b2b_partner_user(uuid, uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS
 $$ SELECT EXISTS (SELECT 1 FROM public.partner_users pu WHERE pu.user_id = $1 AND pu.partner_id = $2 AND pu.revoked_at IS NULL) $$;
CREATE FUNCTION platform_private.catalog_tenant_seller(uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS
 $$ SELECT pa.commercial_owner_organization_id FROM public.partner_accounts pa WHERE pa.id = $1 AND pa.ativo $$;
CREATE FUNCTION platform_private.b2b_internal_commercial_actor() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS
 $$ SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.ativo)
      AND (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor_comercial')) $$;
CREATE FUNCTION platform_private.c2_internal_order_target_reason(uuid, uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS
 $$ SELECT CASE WHEN EXISTS (SELECT 1 FROM public.profiles p JOIN public.partner_accounts a ON a.commercial_owner_organization_id = p.organization_id
                             WHERE p.user_id = $1 AND p.ativo AND a.id = $2) THEN NULL ELSE 'foreign' END $$;
CREATE FUNCTION platform_private.c2_order_actor_scope(p_uid uuid, p_partner uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = p_uid AND p.ativo) THEN RAISE EXCEPTION 'C2_SCOPE_INACTIVE' USING ERRCODE='42501'; END IF;
  IF (public.has_role(p_uid,'administrador') OR public.has_role(p_uid,'gestor_comercial'))
     AND platform_private.c2_internal_order_target_reason(p_uid, p_partner) IS NOT NULL THEN RAISE EXCEPTION 'forbidden_partner' USING ERRCODE='42501'; END IF;
END $$;
CREATE FUNCTION platform_private.c2_owner_order_guard(uuid, uuid, uuid) RETURNS void LANGUAGE sql AS $$ SELECT $$;
CREATE FUNCTION public.fn_b2b_plan_selectable(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION public.fn_b2b_credit_exposure(uuid, numeric, uuid) RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'seam_no_credit'; END $$;
"""

REAL = ["public.has_role_placeholder"]  # (não usado)
REAL_BODIES = ["platform_private.h15_actor_organization", "platform_private.catalog_tenant_actor", "platform_private.tenant_catalog_fence",
               "public.can_view_catalog_internal", "platform_private.fn_catalogo_preco_canonico__tenant_core", "public.fn_catalogo_preco_canonico", "platform_private.fn_b2b_resolve_base_unit_price__tenant_core", "public.fn_b2b_resolve_base_unit_price",
               "platform_private.b2b_actor_scope", "public.get_user_partner_id", "platform_private.c1b_catalog_visibility_scope",
               "platform_private.b2b_partner_catalog_reader", "platform_private.b2b_partner_catalog_item_price", "public.get_partner_catalog_secure.6b56cfb1",
               "public.recorte_a_legacy_solid", "public.fn_b2b_cart_hash", "public.fn_b2b_apply_interest", "public.fn_resolve_commercial_price",
               "platform_private.b2b_packaging_line", "public.fn_resolve_b2b_cart.507077a4", "public.simulate_b2b_payment_plan_secure", "public.rpc_cc_simulate_price",
               "public.rpc_resolve_commercial_prices", "public.get_partner_catalog_tecnico_secure.f0cfc0c6", "public.get_partner_catalog_tecnico_secure.f682465d",
               "public.convert_partner_simulation_to_order_secure"]

ACL = """
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public, platform_private FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.simulate_b2b_payment_plan_secure(uuid,uuid,jsonb,date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_catalogo_preco_canonico(uuid,uuid,text,numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_partner_catalog_secure(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_resolve_b2b_cart(uuid,uuid,jsonb,date) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_resolve_commercial_price(text,uuid,uuid,uuid,uuid,uuid,text,numeric,date,numeric) TO service_role;
"""

DATA = f"""
INSERT INTO public.organizations VALUES ('{A}',true,'ativa',NULL),('{F}',true,'ativa',NULL);
INSERT INTO public.partner_accounts VALUES ('{P}',true,NULL,'{A}'),('{PO}',true,NULL,'{A}'),('{PF}',true,NULL,'{F}');
INSERT INTO public.profiles VALUES ('{UB}','{A}',true),('{UT}','{A}',true),('{UB2}','{A}',true),('{UADM}','{A}',true),('{UADMF}','{F}',true),
  ('{UINACT}','{A}',false),('{UBF}','{F}',true),('{USUP}','{A}',true);
INSERT INTO public.user_roles VALUES ('{UB}','parceiro_b2b'),('{UT}','parceiro_b2b_tecnico'),('{UB2}','parceiro_b2b'),('{UADM}','administrador'),
  ('{UADMF}','administrador'),('{UINACT}','parceiro_b2b'),('{UBF}','parceiro_b2b'),('{USUP}','parceiro_b2b');
INSERT INTO public.superadmins VALUES ('{USUP}');
INSERT INTO public.partner_users VALUES ('{UB}','{P}','{A}',NULL,NULL),('{UT}','{P}','{A}',NULL,NULL),('{UB2}','{PO}','{A}',NULL,NULL),
  ('{UINACT}','{P}','{A}',NULL,NULL),('{UBF}','{PF}','{F}',NULL,NULL),('{USUP}','{P}','{A}',NULL,NULL);
INSERT INTO public.feature_grants SELECT x, 'catalogo_precos' FROM unnest(ARRAY['{UB}','{UT}','{UB2}','{UADM}','{UADMF}','{UINACT}','{UBF}','{USUP}']::uuid[]) x;
INSERT INTO public.produtos VALUES ('{LIQ}','Químico TESTE 1L','Q1',true,true,'{A}',NULL,NULL,NULL,NULL),
  ('{SOL}','Sólido TESTE','S1',true,true,'{A}',NULL,NULL,NULL,NULL),
  ('{FLIQ}','Líquido de F','FQ',true,true,'{F}',NULL,NULL,NULL,NULL),
  ('{HID}','Líquido oculto A','H1',true,true,'{A}',NULL,NULL,NULL,NULL);
INSERT INTO public.microrganismos VALUES ('{MICRO}','Bio TESTE','M1',true,true,'{A}',NULL,NULL,NULL);
INSERT INTO public.catalogo_volumes VALUES ('{VLIQ}','{LIQ}',NULL,1000,1,1,true,'{A}','volume'),('{VFLIQ}','{FLIQ}',NULL,1000,7,7,true,'{F}','volume'),
  ('{VHID}','{HID}',NULL,1000,3,3,true,'{A}','volume'),('{VMIC}',NULL,'{MICRO}',1000,5,5,true,'{A}','volume'),
  ('{PK25}','{SOL}',NULL,NULL,0,NULL,true,'{A}','embalagem');
INSERT INTO public.catalog_tenant_visibility VALUES ('{A}','produto',true,'{HID}',NULL);
INSERT INTO public.product_sale_units VALUES ('{SOL}','{A}','kg');
INSERT INTO public.product_packagings(id,product_id,owner_organization_id,codigo,peso_liquido_kg) VALUES ('{PK25}','{SOL}','{A}','SACO25',25);
INSERT INTO public.catalogo_precos_embalagem(produto_id,owner_organization_id,packaging_id,preco_brl) VALUES ('{SOL}','{A}','{PK25}',10);
INSERT INTO public.commercial_payment_plans VALUES ('{PLD}',true,'discount_from_base',10,0,0,'none',1,30,NULL,false,false,false,'TESTE 10%','T10');
"""

LIQ_LINE = {"item_id": LIQ, "item_tipo": "produto", "quantidade": 1, "unidade_medida": "unidade", "volume_ml": 1000}
PACK_LINE = {"item_id": SOL, "item_tipo": "produto", "packaging_id": PK25, "quantidade": 2}
MICRO_LINE = {"item_id": MICRO, "item_tipo": "microrganismo", "quantidade": 1, "unidade_medida": "unidade", "volume_ml": 1000}


def sim(uid, partner, items, role="authenticated"):
    return as_user(uid, f"SELECT public.simulate_b2b_payment_plan_secure('{partner}','{PLD}','{json.dumps(items)}'::jsonb, NULL)::text;", role)


def out(r):
    if r.returncode != 0:
        line = [x for x in r.stderr.splitlines() if "ERROR" in x]
        return None, (line[0] if line else r.stderr.strip())
    return json.loads(r.stdout.strip().splitlines()[-1]), None


checks = []


def check(name, ok, detail=""):
    checks.append({"name": name, "ok": bool(ok), "detail": str(detail)[:300]})
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f" :: {detail}"))


def ok_amounts(name, r, table, disc, net):
    j, e = out(r)
    good = j is not None and float(j["table_amount"]) == table and float(j["discount_amount"]) == disc and float(j["net_amount_after_discount"]) == net
    check(name, good, e or (j and {k: j[k] for k in ("table_amount", "discount_amount", "net_amount_after_discount")}))
    return j


def denied(name, r, token):
    j, e = out(r)
    check(name, j is None and token in (e or ""), e or "sucesso indevido")


def matrix(phase):
    if phase == "pre":
        denied("pre: comprador líquido reproduz tenant_catalog_fence_denied", sim(UB, P, [LIQ_LINE]), "tenant_catalog_fence_denied")
        denied("pre: comprador misto reproduz tenant_catalog_fence_denied", sim(UB, P, [PACK_LINE, LIQ_LINE]), "tenant_catalog_fence_denied")
        ok_amounts("pre: comprador só embalagem já passava (20/2/18)", sim(UB, P, [PACK_LINE]), 20, 2, 18)
        ok_amounts("pre: admin interno do vendedor passa a fence (líquido 1/0.1/0.9)", sim(UADM, P, [LIQ_LINE]), 1, 0.1, 0.9)
        return
    tag = phase
    ok_amounts(f"{tag}: comprador líquido 1L (1/0.10/0.90)", sim(UB, P, [LIQ_LINE]), 1, 0.1, 0.9)
    ok_amounts(f"{tag}: comprador embalagem 2x25kg (20/2/18)", sim(UB, P, [PACK_LINE]), 20, 2, 18)
    j = ok_amounts(f"{tag}: comprador misto 2x25kg + 1L (21/2.10/18.90)", sim(UB, P, [PACK_LINE, LIQ_LINE]), 21, 2.1, 18.9)
    check(f"{tag}: misto devolve fontes packaging_price + catalog_volume_price",
          j and sorted(l["price_source"] for l in j["items"]) == ["catalog_volume_price", "packaging_price"], j and [l["price_source"] for l in j["items"]])
    ok_amounts(f"{tag}: comprador microrganismo 1L (5/0.5/4.5)", sim(UB, P, [MICRO_LINE]), 5, 0.5, 4.5)
    tampered = dict(LIQ_LINE, preco_unitario=0.01, final_unit_price=0.01, base_price=0.01)
    ok_amounts(f"{tag}: preço enviado pelo cliente na linha líquida é ignorado (servidor 1/0.9)", sim(UB, P, [tampered]), 1, 0.1, 0.9)
    denied(f"{tag}: preço enviado pelo cliente na embalagem é recusado", sim(UB, P, [dict(PACK_LINE, preco=1)]), "B2B_PACKAGING_CLIENT_PRICE_FORBIDDEN")
    ok_amounts(f"{tag}: admin interno do vendedor continua (1/0.1/0.9)", sim(UADM, P, [LIQ_LINE]), 1, 0.1, 0.9)
    denied(f"{tag}: produto de outro tenant no carrinho do comprador", sim(UB, P, [dict(LIQ_LINE, item_id=FLIQ)]), "b2b_catalog_item_denied")
    denied(f"{tag}: produto oculto para o parceiro", sim(UB, P, [dict(LIQ_LINE, item_id=HID)]), "b2b_catalog_item_denied")
    denied(f"{tag}: comprador simulando outro parceiro do mesmo vendedor", sim(UB, PO, [LIQ_LINE]), "forbidden_partner")
    denied(f"{tag}: comprador de outro tenant simulando o parceiro", sim(UBF, P, [LIQ_LINE]), "forbidden_partner")
    denied(f"{tag}: admin de outro tenant simulando o parceiro", sim(UADMF, P, [LIQ_LINE]), "forbidden_partner")
    denied(f"{tag}: técnico do parceiro", sim(UT, P, [LIQ_LINE]), "forbidden_financial_terms")
    denied(f"{tag}: comprador inativo", sim(UINACT, P, [LIQ_LINE]), "C2_SCOPE_INACTIVE")
    denied(f"{tag}: superadmin com vínculo de parceiro", sim(USUP, P, [LIQ_LINE]), "tenant_catalog_fence_denied")  # leitor nega; fence (inalterada) também nega
    denied(f"{tag}: authenticated sem sessão", sim(None, P, [LIQ_LINE]), "auth_required")
    denied(f"{tag}: anônimo sem EXECUTE", sim(None, P, [LIQ_LINE], role="anon"), "permission denied")
    denied(f"{tag}: wrapper público cercado continua negando o comprador",
           as_user(UB, f"SELECT public.fn_catalogo_preco_canonico('{LIQ}',NULL,'unidade',1000);"), "tenant_catalog_fence_denied")
    denied(f"{tag}: helper privado sem EXECUTE para authenticated",
           as_user(UB, f"SELECT platform_private.b2b_partner_cart_volume_price('{P}','{LIQ}',NULL,'unidade',1000);"),
           "permission denied" if tag != "rollback" else "permission denied")
    H = "SELECT platform_private.b2b_partner_cart_volume_price('%s','%s',NULL,'%s',%s);"
    denied(f"{tag}: rota nova não vale para hectare (catálogo técnico/comercial inalterado)", as_user(UB, H % (P, LIQ, "hectare", "NULL"), "postgres"), "tenant_catalog_fence_denied")
    denied(f"{tag}: rota nova não vale para litro/dose", as_user(UB, H % (P, LIQ, "litro", "NULL"), "postgres"), "tenant_catalog_fence_denied")
    denied(f"{tag}: técnico chamando helper cai no wrapper cercado", as_user(UT, H % (P, LIQ, "unidade", 1000), "postgres"), "tenant_catalog_fence_denied")
    j = as_user(UADM, H % (P, LIQ, "unidade", 1000), "postgres")
    check(f"{tag}: admin interno usa o wrapper cercado (mesmo preço 1)", j.returncode == 0 and j.stdout.strip().splitlines()[-1] in ("1", "1.00", "1.000000"), j.stdout + j.stderr)
    psql(f"INSERT INTO public.user_roles VALUES ('{UB}','administrador')")
    j = as_user(UB, H % (P, LIQ, "unidade", 1000), "postgres")
    check(f"{tag}: comprador acumulando administrador segue o wrapper cercado (fence decide, autoriza ator interno)", j.returncode == 0, j.stderr)
    psql(f"DELETE FROM public.user_roles WHERE user_id='{UB}' AND role='administrador'")
    psql(f"DELETE FROM public.feature_grants WHERE user_id='{UB}'")
    denied(f"{tag}: comprador sem recurso catalogo_precos negado", sim(UB, P, [LIQ_LINE]), "")
    psql(f"INSERT INTO public.feature_grants VALUES ('{UB}','catalogo_precos')")
    denied(f"{tag}: motor fn_resolve_commercial_price sem EXECUTE cliente",
           as_user(UB, f"SELECT public.fn_resolve_commercial_price('partner','{P}',NULL,'{PLD}','{LIQ}',NULL,'unidade',1000);"), "permission denied")


def boot():
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="b2bfence-")); os.chmod(tmp, 0o777); SOCK[0] = str(tmp)
    subprocess.run(su() + ["initdb", "-D", str(tmp / "d"), "-U", "postgres", "-A", "trust"], check=True, capture_output=True)
    subprocess.run(su() + ["pg_ctl", "-D", str(tmp / "d"), "-o", f"-p {PORT} -k {tmp} -c listen_addresses=''", "-l", str(tmp / "log"), "-w", "start"], check=True, capture_output=True)
    subprocess.run(su() + ["createdb", "-h", str(tmp), "-p", PORT, "-U", "postgres", "t"], check=True)
    psql(SCHEMA)
    for b in REAL_BODIES:
        psql(cap(b))
    psql(ACL); psql(DATA)
    return tmp


def stop(tmp):
    subprocess.run(su() + ["pg_ctl", "-D", str(tmp / "d"), "-m", "fast", "stop"], capture_output=True)


def main():
    if not shutil.which("initdb"): print("initdb ausente"); return 2
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="b2bfence-")); os.chmod(tmp, 0o777); SOCK[0] = str(tmp)
    subprocess.run(su() + ["initdb", "-D", str(tmp / "d"), "-U", "postgres", "-A", "trust"], check=True, capture_output=True)
    subprocess.run(su() + ["pg_ctl", "-D", str(tmp / "d"), "-o", f"-p {PORT} -k {tmp} -c listen_addresses=''", "-l", str(tmp / "log"), "-w", "start"], check=True, capture_output=True)
    try:
        subprocess.run(su() + ["createdb", "-h", str(tmp), "-p", PORT, "-U", "postgres", "t"], check=True)
        psql(SCHEMA)
        for b in REAL_BODIES:
            psql(cap(b))
        psql(ACL); psql(DATA)
        # Prova de que os corpos carregados são exatamente os LIVE (md5 do pg_get_functiondef local == md5 capturado).
        import importlib.util
        spec = importlib.util.spec_from_file_location("gen", HERE / "generate.py"); g = importlib.util.module_from_spec(spec); spec.loader.exec_module(g)
        for sig, md in list(g.UNCHANGED.items()) + [(g.CRP_SIG, g.CRP_MD5)]:
            loc = psql(f"SELECT md5(pg_get_functiondef('{sig}'::regprocedure))").stdout.strip()
            check(f"corpo real carregado byte a byte: {sig}", loc == md, f"{loc} != {md}")
        r = runfile(HERE / "01-pre.sql.readonly"); check("01 PRE_OK", r.returncode == 0 and "PRE_OK" in r.stderr, r.stderr[-300:])
        matrix("pre")
        r = runfile(HERE / "02-install.sql.review"); check("02 install aplicou e pins pós conferem", r.returncode == 0, r.stderr[-400:])
        r = runfile(HERE / "03-post.sql.readonly"); check("03 POST_OK", r.returncode == 0 and "POST_OK" in r.stderr, r.stderr[-300:])
        r = runfile(HERE / "01-pre.sql.readonly"); check("rerun: PRE recusa após instalação", r.returncode != 0, r.stderr[-200:])
        matrix("post")
        r = runfile(HERE / "04-rollback-deny.sql.review"); check("04 rollback deny aplicou", r.returncode == 0, r.stderr[-300:])
        denied("rollback: comprador volta a ser negado pela fence (misto)", sim(UB, P, [PACK_LINE, LIQ_LINE]), "tenant_catalog_fence_denied")
        ok_amounts("rollback: embalagem segue como antes", sim(UB, P, [PACK_LINE]), 20, 2, 18)
        denied("rollback: helper é corpo de negação",
               psql(f"SET ROLE postgres; SELECT platform_private.b2b_partner_cart_volume_price('{P}','{LIQ}',NULL,'unidade',1000);", check=False),
               "b2b_cart_catalog_fence_rolled_back")
    finally:
        subprocess.run(su() + ["pg_ctl", "-D", str(tmp / "d"), "-m", "fast", "stop"], capture_output=True)
    fails = [c for c in checks if not c["ok"]]
    ev = {"package": "B2B_CART_CATALOG_FENCE_V1", "disposable_pg": True, "hosted_proof": False,
          "real_bodies": REAL_BODIES, "seams": "ver docstring", "passed": len(checks) - len(fails), "total": len(checks), "checks": checks}
    (HERE / "evidence-local-pg.json").write_text(json.dumps(ev, indent=2, ensure_ascii=False) + "\n")
    print(f"{'PASS' if not fails else 'FAIL'} {len(checks) - len(fails)}/{len(checks)}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
