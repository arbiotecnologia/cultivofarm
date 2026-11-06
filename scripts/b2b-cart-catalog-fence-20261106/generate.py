#!/usr/bin/env python3
"""B2B_CART_CATALOG_FENCE_V1 — gera 01/02/03/04 a partir de corpos LIVE capturados (md5 conferido).

Causa: public.fn_resolve_commercial_price (INVOKER, md5 0df0d900) chama o wrapper público CERCADO
public.fn_catalogo_preco_canonico (b201e49e) -> platform_private.tenant_catalog_fence('read_catalog') ->
catalog_tenant_actor('read_catalog') -> can_view_catalog_internal(uid). O comprador parceiro_b2b legítimo
(perfil no tenant vendedor, só papel parceiro_b2b) não é ator de catálogo interno: 42501 tenant_catalog_fence_denied.

Delta mínimo (nada é relaxado):
 * novo helper privado platform_private.b2b_partner_cart_volume_price (zero EXECUTE cliente):
   - tenta o leitor canônico b2b_partner_catalog_reader(p_partner); se autorizado, exige item do vendedor
     ativo/b2b/não oculto (predicado idêntico a b2b_partner_catalog_item_price) e devolve o núcleo privado;
   - se o leitor nega (42501), devolve EXATAMENTE o wrapper público cercado (comportamento anterior).
 * fn_resolve_commercial_price: só a linha do preço canônico troca, e só para p_buyer_scope='partner'.
Fence, catalog_tenant_actor, can_view_catalog_internal e wrappers públicos ficam byte a byte.
"""
import hashlib, json, pathlib

HERE = pathlib.Path(__file__).resolve().parent
CAP = HERE / "captured"


def cap(prefix):
    [p] = [x for x in CAP.iterdir() if x.name.startswith(prefix + ".")]
    b = p.read_bytes(); md = hashlib.md5(b).hexdigest()
    assert md[:8] == p.name.split(".")[-3], p.name
    return b.decode(), md


CRP, CRP_MD5 = cap("public.fn_resolve_commercial_price")
OLD = "    v_base := public.fn_catalogo_preco_canonico(p_product_id, p_microrganismo_id, p_unit_type, p_volume_ml);\n"
NEW = ("    -- B2B_CART_CATALOG_FENCE_V1: comprador parceiro passa pelo leitor canônico; demais atores seguem o wrapper cercado.\n"
       "    v_base := CASE WHEN p_buyer_scope = 'partner'\n"
       "                   THEN platform_private.b2b_partner_cart_volume_price(p_partner_id, p_product_id, p_microrganismo_id, p_unit_type, p_volume_ml)\n"
       "                   ELSE public.fn_catalogo_preco_canonico(p_product_id, p_microrganismo_id, p_unit_type, p_volume_ml) END;\n")
assert CRP.count(OLD) == 1, "âncora do preço canônico deve ocorrer exatamente uma vez"
CRP_NEW = CRP.replace(OLD, NEW)
CRP_NEW_MD5 = hashlib.md5(CRP_NEW.encode()).hexdigest()

HELPER_SIG = "platform_private.b2b_partner_cart_volume_price(uuid,uuid,uuid,text,numeric)"
HELPER = r"""CREATE OR REPLACE FUNCTION platform_private.b2b_partner_cart_volume_price(p_partner_id uuid, p_product_id uuid, p_microrganismo_id uuid, p_unit_type text, p_volume_ml numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- B2B_CART_CATALOG_FENCE_V1. Sem EXECUTE para clientes; só chamado por fn_resolve_commercial_price (escopo partner).
DECLARE v_seller uuid; v_uid uuid := auth.uid();
BEGIN
  -- Rota nova SOMENTE para: linha de carrinho por volume (unidade + volume_ml > 0) e comprador externo puro
  -- (parceiro_b2b sem administrador/gestor_comercial). Unidades hectare/litro/dose (catálogos técnico/comercial)
  -- e atores internos seguem exatamente o wrapper cercado anterior.
  IF p_unit_type IS DISTINCT FROM 'unidade' OR COALESCE(p_volume_ml, 0) <= 0
     OR v_uid IS NULL
     OR public.has_role(v_uid, 'parceiro_b2b'::public.app_role) IS NOT TRUE
     OR public.has_role(v_uid, 'administrador'::public.app_role) IS NOT FALSE
     OR public.has_role(v_uid, 'gestor_comercial'::public.app_role) IS NOT FALSE THEN
    RETURN public.fn_catalogo_preco_canonico(p_product_id, p_microrganismo_id, p_unit_type, p_volume_ml);
  END IF;
  BEGIN
    v_seller := platform_private.b2b_partner_catalog_reader(p_partner_id);   -- guard canônico: técnico/superadmin/outro parceiro/inativo negam
  EXCEPTION WHEN insufficient_privilege THEN
    v_seller := NULL;
  END;
  IF v_seller IS NULL THEN
    -- Não é leitor B2B autorizado deste parceiro: caminho anterior, inalterado, com tenant_catalog_fence.
    RETURN public.fn_catalogo_preco_canonico(p_product_id, p_microrganismo_id, p_unit_type, p_volume_ml);
  END IF;
  IF num_nonnulls(p_product_id, p_microrganismo_id) <> 1 THEN RETURN NULL; END IF;
  IF p_product_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.produtos z WHERE z.id = p_product_id
       AND z.owner_organization_id = v_seller AND z.ativo IS TRUE AND z.b2b_enabled IS TRUE
       AND NOT EXISTS (SELECT 1 FROM public.catalog_tenant_visibility cv WHERE cv.organization_id = ANY(platform_private.c1b_catalog_visibility_scope(p_partner_id))
                       AND cv.entity_type = 'produto' AND cv.hidden IS TRUE AND cv.produto_id = z.id)) THEN
    RAISE EXCEPTION 'b2b_catalog_item_denied' USING ERRCODE='42501'; END IF;
  IF p_microrganismo_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.microrganismos z WHERE z.id = p_microrganismo_id
       AND z.owner_organization_id = v_seller AND z.ativo IS TRUE AND z.b2b_enabled IS TRUE
       AND NOT EXISTS (SELECT 1 FROM public.catalog_tenant_visibility cv WHERE cv.organization_id = ANY(platform_private.c1b_catalog_visibility_scope(p_partner_id))
                       AND cv.entity_type = 'microrganismo' AND cv.hidden IS TRUE AND cv.microrganismo_id = z.id)) THEN
    RAISE EXCEPTION 'b2b_catalog_item_denied' USING ERRCODE='42501'; END IF;
  RETURN platform_private.fn_catalogo_preco_canonico__tenant_core(p_product_id, p_microrganismo_id, p_unit_type, p_volume_ml);
END $function$
"""
HELPER_DENY = r"""CREATE OR REPLACE FUNCTION platform_private.b2b_partner_cart_volume_price(p_partner_id uuid, p_product_id uuid, p_microrganismo_id uuid, p_unit_type text, p_volume_ml numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  RAISE EXCEPTION 'b2b_cart_catalog_fence_rolled_back' USING ERRCODE='42501';
END $function$
"""

# Pins LIVE que não podem mudar (fence, ator, papéis, wrappers públicos, leitores e núcleos).
UNCHANGED = {
    "platform_private.tenant_catalog_fence(text,uuid[])": "8c6e3eca826410f7e8a504a86ae9381f",
    "platform_private.catalog_tenant_actor(text)": "5e0ce9cc9122f1c21d76e29a13de8b59",
    "public.can_view_catalog_internal(uuid)": "b04164dd8464d16f52cb69e7bcf83de7",
    "public.fn_catalogo_preco_canonico(uuid,uuid,text,numeric)": "b201e49e0158bde0140e018282c047fc",
    "public.fn_b2b_resolve_base_unit_price(uuid,uuid,uuid,text,numeric,date)": "87418209039589320959c9891e97916c",
    "platform_private.b2b_partner_catalog_reader(uuid)": "bd985484b69c8fa6e63a920eff518369",
    "platform_private.b2b_partner_catalog_item_price(uuid,uuid,uuid,text,numeric,date)": "61e545e6138485ba995f989d2011590a",
    "platform_private.fn_catalogo_preco_canonico__tenant_core(uuid,uuid,text,numeric)": cap("platform_private.fn_catalogo_preco_canonico__tenant_core")[1],
    "public.fn_resolve_b2b_cart(uuid,uuid,jsonb,date)": cap("public.fn_resolve_b2b_cart")[1],
    "platform_private.b2b_packaging_line(uuid,uuid,jsonb,date)": cap("platform_private.b2b_packaging_line")[1],
    "public.simulate_b2b_payment_plan_secure(uuid,uuid,jsonb,date)": cap("public.simulate_b2b_payment_plan_secure")[1],
}
# Funções expostas que chamam o motor: pinadas sem mudança (revisão de impacto no README).
UNCHANGED.update({
    "public.rpc_cc_simulate_price(text,uuid,uuid,uuid,uuid,uuid,text,numeric,date,numeric)": cap("public.rpc_cc_simulate_price")[1],
    "public.rpc_resolve_commercial_prices(jsonb,uuid,date,jsonb)": cap("public.rpc_resolve_commercial_prices")[1],
    "public.get_partner_catalog_tecnico_secure()": cap("public.get_partner_catalog_tecnico_secure.f0cfc0c6")[1],
    "public.get_partner_catalog_tecnico_secure(boolean)": cap("public.get_partner_catalog_tecnico_secure.f682465d")[1],
    "public.convert_partner_simulation_to_order_secure(uuid,text,uuid,date,integer,boolean)": cap("public.convert_partner_simulation_to_order_secure")[1],
})
CRP_SIG = "public.fn_resolve_commercial_price(text,uuid,uuid,uuid,uuid,uuid,text,numeric,date,numeric)"


def pin(sig, md, label):
    return (f"  IF to_regprocedure('{sig}') IS NULL OR md5(pg_get_functiondef('{sig}'::regprocedure)) <> '{md}' THEN\n"
            f"    RAISE EXCEPTION '{label}: {sig} divergente'; END IF;\n")


def unchanged_block(label):
    return "".join(pin(s, m, label) for s, m in UNCHANGED.items())


ACL_CHECK = (
    "  IF EXISTS (SELECT 1 FROM pg_proc p, aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a\n"
    "             WHERE p.oid = '{sig}'::regprocedure AND a.privilege_type = 'EXECUTE'\n"
    "               AND a.grantee IN (0, 'anon'::regrole::oid, 'authenticated'::regrole::oid)) THEN\n"
    "    RAISE EXCEPTION '{label}: {sig} executável por cliente'; END IF;\n")


def write(name, text):
    (HERE / name).write_text(text)


PRE = ("-- 01 PRE (somente leitura). Projeto canônico obrigatório: swzpzcwiasxmjutrmvkm (conferir FORA do SQL antes de rodar).\n"
       "DO $$ BEGIN\n" + pin(CRP_SIG, CRP_MD5, "PRE") + unchanged_block("PRE") +
       f"  IF to_regprocedure('{HELPER_SIG}') IS NOT NULL THEN RAISE EXCEPTION 'PRE: helper já existe (rerun?)'; END IF;\n"
       + ACL_CHECK.format(sig=CRP_SIG, label="PRE") +
       "  RAISE NOTICE 'PRE_OK';\nEND $$;\n")

INSTALL = ("-- 02 INSTALL (REVISÁVEL, NÃO APLICAR sem autorização). B2B_CART_CATALOG_FENCE_V1.\nBEGIN;\n"
           "DO $$ BEGIN\n" + pin(CRP_SIG, CRP_MD5, "INSTALL") + unchanged_block("INSTALL") +
           f"  IF to_regprocedure('{HELPER_SIG}') IS NOT NULL THEN RAISE EXCEPTION 'INSTALL: helper já existe'; END IF;\nEND $$;\n"
           + HELPER.rstrip("\n") + ";\n"
           f"REVOKE ALL ON FUNCTION {HELPER_SIG} FROM PUBLIC, anon, authenticated;\n"
           + CRP_NEW.rstrip("\n") + ";\n"
           "DO $$ BEGIN\n" + pin(CRP_SIG, CRP_NEW_MD5, "INSTALL_POST") + unchanged_block("INSTALL_POST")
           + ACL_CHECK.format(sig=HELPER_SIG, label="INSTALL_POST") + ACL_CHECK.format(sig=CRP_SIG, label="INSTALL_POST") +
           "END $$;\nCOMMIT;\n")

POST = ("-- 03 POST (somente leitura).\nDO $$ BEGIN\n" + pin(CRP_SIG, CRP_NEW_MD5, "POST") + unchanged_block("POST")
        + ACL_CHECK.format(sig=HELPER_SIG, label="POST") + ACL_CHECK.format(sig=CRP_SIG, label="POST") +
        f"  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = '{HELPER_SIG}'::regprocedure) THEN RAISE EXCEPTION 'POST: helper não é DEFINER'; END IF;\n"
        f"  IF (SELECT prosecdef FROM pg_proc WHERE oid = '{CRP_SIG}'::regprocedure) THEN RAISE EXCEPTION 'POST: motor virou DEFINER'; END IF;\n"
        "  RAISE NOTICE 'POST_OK';\nEND $$;\n")

ROLLBACK = ("-- 04 ROLLBACK deny-only: restaura o motor original (comprador volta a ser negado pela fence) e mantém o helper como corpo de negação.\nBEGIN;\n"
            "DO $$ BEGIN\n" + pin(CRP_SIG, CRP_NEW_MD5, "ROLLBACK") + "END $$;\n"
            + CRP.rstrip("\n") + ";\n" + HELPER_DENY.rstrip("\n") + ";\n"
            f"REVOKE ALL ON FUNCTION {HELPER_SIG} FROM PUBLIC, anon, authenticated;\n"
            "DO $$ BEGIN\n" + pin(CRP_SIG, CRP_MD5, "ROLLBACK_POST") + unchanged_block("ROLLBACK_POST") + "END $$;\nCOMMIT;\n")

if __name__ == "__main__":
    files = {"01-pre.sql.readonly": PRE, "02-install.sql.review": INSTALL, "03-post.sql.readonly": POST, "04-rollback-deny.sql.review": ROLLBACK}
    for n, t in files.items():
        write(n, t)
    meta = {n: hashlib.md5(t.encode()).hexdigest() for n, t in files.items()}
    meta["fn_resolve_commercial_price.pre"] = CRP_MD5
    meta["fn_resolve_commercial_price.post"] = CRP_NEW_MD5
    write("generated-md5.json", json.dumps(meta, indent=2) + "\n")
    print(json.dumps(meta, indent=2))
