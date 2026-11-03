"""Cenários v2.7 que só fazem sentido no esquema REAL: fiscal por tenant, NCM, unicidade real, policies Superadmin."""
import json, uuid
import harness as H

K = lambda n: str(uuid.UUID(int=0xF15C0000 + n))
KIND = "PG_DISPOSABLE_REAL_SCHEMA_SYNTHETIC_AUTH"


POS_DETAIL = {}


def _ae11_fixtures():
    ARB, LOTA, PF, TALA = H.ARB, H.LOTA, H.PF, H.TALA
    CLIA, FAZA = H.CLIA_R, H.FAZA_R   # pais AR Bio reais da semeadura do esquema real (harness_real)
    os_ins = lambda oid, own: (f"INSERT INTO public.ordens_servico(id,origem,cliente_id,fazenda_id,talhao_id,produto_id,organization_id) "
                               f"VALUES ('{oid}','agronomica','{CLIA}','{FAZA}','{TALA}','{own}','{ARB}');")
    return {
        "estoque_embalagens": lambda rid, own: ([], f"INSERT INTO public.estoque_embalagens(id,lote_id,produto_id,status) VALUES ('{rid}','{LOTA}','{own}','em_estoque');"),
        "produto_etiquetas": lambda rid, own: ([], f"INSERT INTO public.produto_etiquetas(id,lote_id,produto_id,status,tipo_etiqueta) VALUES ('{rid}','{LOTA}','{own}','gerada','principal');"),
        "ordens_servico": lambda rid, own: ([], os_ins(rid, own)),
        "programacao_producao": lambda rid, own: ([], f"INSERT INTO public.programacao_producao(id,organization_id,produto_id) VALUES ('{rid}','{ARB}','{own}');"),
        "os_faturamento_base": lambda rid, own: (["ordens_servico"], os_ins(str(uuid.UUID(int=0xAE11F000)), own)
            + f"INSERT INTO public.os_faturamento_base(id,origem_os_tipo,ordem_servico_id,cliente_id,produto_id) VALUES ('{rid}','TRADICIONAL','{uuid.UUID(int=0xAE11F000)}','{CLIA}','{own}');"),
        "registros_consultor_recomendacoes": lambda rid, own: ([], f"INSERT INTO public.registros_consultor_recomendacoes(id,registro_consultor_id,produto_biologico_sugerido_id) VALUES ('{rid}','{H.RC1}','{own}');"),
        "commercial_condition_item_prices": lambda rid, own: (["commercial_payment_plans"],
            f"INSERT INTO public.commercial_payment_plans(id,name,code,plan_type) VALUES ('{uuid.UUID(int=0xAE11C000)}','AE11 plano sintético','AE11-SYN','custom');"
            f"INSERT INTO public.commercial_condition_item_prices(id,plan_id,buyer_scope,partner_id,product_id,unit_type,pricing_mode,status,min_quantity,valid_from) "
            f"VALUES ('{rid}','{uuid.UUID(int=0xAE11C000)}','partner','{PF}','{own}','hectare','quote_only','draft',0,CURRENT_DATE);"),
    }


def run(pg, q, check, as_user, val):
    global AE11_FIXTURES
    AE11_FIXTURES = _ae11_fixtures()
    run_main(pg, q, check, as_user, val)
    run_fence(pg, q, check, as_user, val)
    run_fin_assoc(pg, q, check, as_user, val)
    run_ae(pg, q, check, as_user, val)


def run_main(pg, q, check, as_user, val):
    c = lambda cid, scen, exp, act: check(cid, scen, exp, act, kind=KIND)
    ARB, FSF, UA, UF, UB2B, USA = H.ARB, H.FSF, H.UA, H.UF, H.UB2B, H.USA
    # ---------- fiscal por tenant ----------
    pa = q(f"INSERT INTO public.produtos(id,nome,codigo,tipo,owner_organization_id,b2b_enabled) VALUES (gen_random_uuid(),'Fiscal ARB','FARB','inoculante','{ARB}',false) RETURNING id").splitlines()[-1]
    pf = q(f"SELECT id FROM public.produtos WHERE owner_organization_id='{FSF}' ORDER BY nome LIMIT 1")
    def save(u, pid, exp, vals, key, reason="Classificação informada pela contabilidade"):
        e = "NULL" if exp is None else f"'{exp}'::timestamptz"
        return pg.sql(as_user(u) + f"SELECT public.tenant_owned_product_fiscal_save('{pid}', {e}, '{json.dumps(vals)}'::jsonb, '{reason}', '{key}')::text;", ok=False)
    r = pg.sql(as_user(UA) + "SELECT count(*) FROM public.product_fiscal_profiles;", ok=False)
    c("FIS-1", "leitura de perfil fiscal pelo gestor AR Bio não quebra (policies globais substituídas; antes 42501 permission denied)", True, not r.startswith("ERR"))
    c("FIS-2", "gestor AR Bio só vê perfis de produtos AR Bio", "0", val(pg.sql(as_user(UA) + f"SELECT count(*) FROM public.product_fiscal_profiles f JOIN public.produtos p ON p.id=f.product_id WHERE p.owner_organization_id<>'{ARB}';", ok=False)))
    c("FIS-3", "gestor FSF não vê perfis AR Bio", "0", val(pg.sql(as_user(UF) + f"SELECT count(*) FROM public.product_fiscal_profiles f WHERE f.product_id IN (SELECT id FROM public.produtos WHERE owner_organization_id='{ARB}');", ok=False)))
    r1 = save(UA, pa, None, {"ncm": "31010000", "cfop_in_state": "5101"}, K(1)); j1 = json.loads(val(r1)) if not r1.startswith("ERR") else {}
    c("FIS-4", "writer canônico: cria perfil DRAFT do dono (AR Bio), ACK exato não idempotente", f"True|DRAFT|{ARB}|False|{pa}",
      f"{j1.get('success')}|{j1.get('profile_status')}|{j1.get('organization_id')}|{j1.get('idempotent')}|{j1.get('product_id')}" if j1 else r1[:200])
    r2 = save(UA, pa, None, {"ncm": "31010000", "cfop_in_state": "5101"}, K(1)); j2 = json.loads(val(r2)) if not r2.startswith("ERR") else {}
    c("FIS-5", "replay mesma chave/payload: idempotente, mesmo perfil", f"True|{j1.get('profile_id')}", f"{j2.get('idempotent')}|{j2.get('profile_id')}" if j2 else r2[:200])
    c("FIS-6", "mesma chave com payload diferente: PT409", True, "FISCAL_IDEMPOTENCY_CONFLICT" in save(UA, pa, None, {"ncm": "31010099"}, K(1)))
    c("FIS-7", "CAS: expected desatualizado => PT409", True, "FISCAL_CAS_CONFLICT" in save(UA, pa, "2000-01-01T00:00:00Z", {"ncm": "31010099"}, K(2)))
    c("FIS-7b", "CAS: perfil existente com expected NULL => PT409", True, "FISCAL_CAS_CONFLICT" in save(UA, pa, None, {"ncm": "31010099"}, K(3)))
    r3 = save(UA, pa, j1.get("updated_at"), {"ncm": "31010099"}, K(4)); j3 = json.loads(val(r3)) if not r3.startswith("ERR") else {}
    newer = q("SELECT '%s'::timestamptz > '%s'::timestamptz" % (j3.get("updated_at"), j1.get("updated_at"))) == "t" if j3 and j1 else None
    c("FIS-8", "CAS correto atualiza; token updated_at do servidor estritamente maior", "True|True",
      f"{j3.get('success')}|{newer}" if j3 else r3[:200])
    c("FIS-8b", "campos não enviados preservados (cfop_in_state) e NCM novo gravado", "5101|31010099|DRAFT",
      q(f"SELECT cfop_in_state||'|'||ncm||'|'||profile_status FROM public.product_fiscal_profiles WHERE product_id='{pa}' AND is_active"))
    c("FIS-9", "gestor FSF não grava perfil de produto AR Bio (42501, sem oráculo)", True, "FISCAL_FORBIDDEN" in save(UF, pa, None, {"ncm": "31010000"}, K(5)))
    c("FIS-10", "leitor sem papel mutate negado", True, "FISCAL_FORBIDDEN" in save(UB2B, pf, None, {"ncm": "31010000"}, K(6)) or "catalog_visibility_role_denied" in save(UB2B, pf, None, {"ncm": "31010000"}, K(6)))
    rsa = save(USA, pa, None, {"ncm": "31010000"}, K(7))
    c("FIS-11", "Superadmin sem bypass no writer fiscal", True, "FISCAL_FORBIDDEN" in rsa or "platform_actor_denied" in rsa)
    c("FIS-12", "anon sem EXECUTE", True, "permission denied" in pg.sql(as_user(None, "anon") + f"SELECT public.tenant_owned_product_fiscal_save('{pa}',NULL,'{{}}'::jsonb,'xxxxxxxxxxxx','{K(8)}');", ok=False))
    c("FIS-13", "campo profile_status no payload recusado (22023)", True, "FISCAL_FIELD_NOT_ALLOWED" in save(UA, pa, None, {"profile_status": "VALIDATED"}, K(9)))
    c("FIS-14", "NCM fora do formato recusado (22023)", True, "FISCAL_INVALID_FORMAT:ncm" in save(UA, pa, None, {"ncm": "3101"}, K(10)))
    c("FIS-15", "motivo curto recusado (22023)", True, "FISCAL_INVALID_REASON" in save(UA, pa, None, {"ncm": "31010000"}, K(11), reason="curto"))
    c("FIS-16", "cliente não escreve direto (INSERT)", True, "permission denied" in pg.sql(as_user(UA) + f"INSERT INTO public.product_fiscal_profiles(product_id) VALUES ('{pa}');", ok=False))
    c("FIS-17", "cliente não escreve direto (UPDATE)", True, "permission denied" in pg.sql(as_user(UA) + "UPDATE public.product_fiscal_profiles SET ncm='31010000';", ok=False))
    # escritor DEFINER indireto (dono da tabela, ignora RLS) chamado na sessão autenticada: só o gatilho decide
    q("""CREATE FUNCTION public.zz_indirect_fiscal_writer(p_sql text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
BEGIN EXECUTE p_sql; END $f$; GRANT EXECUTE ON FUNCTION public.zz_indirect_fiscal_writer(text) TO authenticated;""")
    ind = lambda u, stmt: pg.sql(as_user(u) + "SELECT public.zz_indirect_fiscal_writer($s$" + stmt + "$s$);", ok=False)
    tgt = f"WHERE product_id='{pa}' AND is_active"
    c("FIS-18", "escritor DEFINER indireto do dono não promove VALIDATED (gatilho)", True, "FISCAL_VALIDATION_NOT_ALLOWED" in ind(UA, f"UPDATE public.product_fiscal_profiles SET profile_status='VALIDATED' {tgt}"))
    c("FIS-19", "escritor DEFINER indireto não carimba validação contábil (gatilho)", True, "FISCAL_VALIDATION_NOT_ALLOWED" in ind(UA, f"UPDATE public.product_fiscal_profiles SET accounting_validated_at=now() {tgt}"))
    c("FIS-20", "escritor DEFINER indireto com ator de outro tenant negado (gatilho)", True, "FISCAL_FORBIDDEN" in ind(UF, f"UPDATE public.product_fiscal_profiles SET ncm='31010000' {tgt}"))
    c("FIS-21", "escritor DEFINER indireto com Superadmin negado (gatilho, sem ramo global)", True, "FISCAL_FORBIDDEN" in ind(USA, f"UPDATE public.product_fiscal_profiles SET ncm='31010000' {tgt}"))
    c("FIS-21b", "escritor DEFINER indireto do dono com campo comum: aceito, volta DRAFT, token CAS avança", "DRAFT",
      (lambda r: q(f"SELECT profile_status FROM public.product_fiscal_profiles {tgt}") if not r.startswith("ERR") else r[:200])(ind(UA, f"UPDATE public.product_fiscal_profiles SET cest='1234567' {tgt}")))
    c("FIS-21c", "escritor DEFINER indireto não insere perfil para produto de outro tenant", True,
      "FISCAL_FORBIDDEN" in ind(UA, f"INSERT INTO public.product_fiscal_profiles(product_id,is_active) VALUES ('{pf}', false)"))
    r = pg.sql(f"RESET ROLE; SET test.uid=''; UPDATE public.product_fiscal_profiles SET ncm='31010000' {tgt};", ok=False)
    c("FIS-22", "escritor sem ator (serviço/legado) negado (gatilho)", True, "FISCAL_FORBIDDEN" in r)
    q("DROP FUNCTION public.zz_indirect_fiscal_writer(text);")
    if False:
      pass
    # cenários 18–22 sem sessão autenticada substituídos pelos acima (escritor DEFINER real na sessão)
    q("SET test.uid='';")
    c("FIS-23", "nenhuma policy de perfil fiscal/produtos com ramo Superadmin/global", "0",
      q("SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN ('product_fiscal_profiles','produtos','microrganismos','culturas','catalogo_volumes','formulacoes') AND (coalesce(qual,'')||coalesce(with_check,'')) ~* '(superadmin|global_product_fiscal)'"))
    c("FIS-24", "recibos privados: sem acesso de authenticated", True, "permission denied" in pg.sql(as_user(UA) + "SELECT count(*) FROM platform_private.tenant_product_fiscal_receipts;", ok=False))
    c("FIS-25", "gate/emissão fiscal intocados (settings AR Bio false)", "false|false|false",
      q(f"SELECT nfe_enabled||'|'||nfse_enabled||'|'||production_enabled FROM public.company_fiscal_settings WHERE organization_id='{ARB}'"))
    # ---------- policies Superadmin removidas (achado real d51_5) ----------
    c("SA-1", "ledger registra remoção das RESTRICTIVE Superadmin reais (d51_5 produtos/micro + catalog_volumes_sa_*)", True,
      int(q("SELECT count(*) FROM platform_private.tenant_catalog_migration_ledger WHERE step='superadmin_policy_dropped' AND detail->>'name' ~ '^(d51_5_|catalog_volumes_sa_)'") or 0) >= 3)
    r = pg.sql(as_user(UA) + f"UPDATE public.microrganismos SET nome=nome WHERE owner_organization_id='{ARB}' RETURNING id;", ok=False)
    c("SA-2", "gestor AR Bio atualiza microrganismo próprio (antes bloqueado pela RESTRICTIVE Superadmin)", True, (not r.startswith("ERR")) and len(r.strip()) > 0)
    # ---------- unicidade real reescopada por tenant ----------
    c("UQ-1", "culturas_nome_ci_uidx reescopado por tenant preservando expressão", True,
      "(owner_organization_id, lower(btrim(nome)))" in q("SELECT pg_get_indexdef('public.culturas_nome_ci_uidx_tenant'::regclass)"))
    c("UQ-2", "microrganismos_codigo_uniq reescopado preservando predicado parcial", True,
      "WHERE (codigo IS NOT NULL)" in q("SELECT pg_get_indexdef('public.microrganismos_codigo_uniq_tenant'::regclass)"))
    ra = pg.sql(as_user(UA) + "INSERT INTO public.culturas(nome) VALUES ('Milho UQ') RETURNING owner_organization_id;", ok=False)
    rf = pg.sql(as_user(UF) + "INSERT INTO public.culturas(nome) VALUES ('milho uq ') RETURNING owner_organization_id;", ok=False)
    c("UQ-3", "mesmo nome de cultura em empresas diferentes é permitido", f"{ARB}|{FSF}", f"{val(ra)}|{val(rf)}")
    c("UQ-4", "mesmo nome (case/espaço) na mesma empresa recusado pelo índice real", True,
      "culturas_nome_ci_uidx_tenant" in pg.sql(as_user(UA) + "INSERT INTO public.culturas(nome) VALUES (' MILHO uq');", ok=False))
    # ---------- NCM: candidatos são dossiê da empresa ----------
    na = q(f"SELECT count(*) FROM public.microorganism_ncm_candidates n JOIN public.microorganism_regulatory_dossiers d ON d.id=n.dossier_id JOIN public.microrganismos m ON m.id=d.microorganism_id WHERE m.owner_organization_id='{ARB}'")
    c("NCM-1", "candidato NCM copiado junto ao dossiê do tenant dono", "1", na)
    c("NCM-2", "nenhum candidato NCM órfão do dossiê original", "0", q("SELECT count(*) FROM public.microorganism_ncm_candidates WHERE id='" + H.U(61) + "'"))
    c("NCM-3", "dossiê copiado aponta para o candidato publicado copiado do MESMO tenant", "1",
      q("SELECT count(*) FROM public.microorganism_regulatory_dossiers d JOIN public.microorganism_ncm_candidates n ON n.id=d.published_ncm_candidate_id AND n.dossier_id=d.id"))
    c("NCM-4", "gestor FSF não lê candidatos NCM da AR Bio (policy LIVE fn_regulatory_can_read sem tenant + restritiva)", "0",
      val(pg.sql(as_user(UF) + "SELECT count(*) FROM public.microorganism_ncm_candidates;", ok=False)))
    c("NCM-5", "gestor AR Bio lê o próprio candidato NCM", "1", val(pg.sql(as_user(UA) + "SELECT count(*) FROM public.microorganism_ncm_candidates;", ok=False)))
    c("NCM-6", "candidato NCM não vira aprovação fiscal do produto (perfil do produto segue DRAFT)", "0",
      q("SELECT count(*) FROM public.product_fiscal_profiles WHERE profile_status NOT IN ('DRAFT','BLOCKED') AND updated_at > now() - interval '1 hour'"))


    # v2.11: escrita direta de cliente em product_fiscal_profiles fechada após migrar o consumidor de UI para o RPC
    r = pg.sql(as_user(UA) + f"INSERT INTO public.product_fiscal_profiles(product_id) VALUES ('{pa}');", ok=False)
    r2 = pg.sql(as_user(UA) + f"UPDATE public.product_fiscal_profiles SET ncm='31010000' WHERE product_id='{pa}';", ok=False)
    c("FIS-REV", "gestor AR Bio: INSERT/UPDATE direto em product_fiscal_profiles negado (só o writer canônico grava)", "True|True",
      f"{'permission denied' in r}|{'permission denied' in r2}")
    c("FIS-REV-b", "ACL: authenticated sem INSERT/UPDATE/DELETE em product_fiscal_profiles; EXECUTE do writer canônico mantido", "false|false|false|true",
      q("SELECT has_table_privilege('authenticated','public.product_fiscal_profiles','INSERT')||'|'||has_table_privilege('authenticated','public.product_fiscal_profiles','UPDATE')||'|'||"
        "has_table_privilege('authenticated','public.product_fiscal_profiles','DELETE')||'|'||has_function_privilege('authenticated','public.tenant_owned_product_fiscal_save(uuid,timestamptz,jsonb,text,uuid)','EXECUTE')"))


def run_fence(pg, q, check, as_user, val):
    c = lambda cid, scen, exp, act: check(cid, scen, exp, act, kind=KIND)
    ARB, FSF, UA, UF, UB2B, USA = H.ARB, H.FSF, H.UA, H.UF, H.UB2B, H.USA
    pa = q(f"SELECT id FROM public.produtos WHERE owner_organization_id='{ARB}' ORDER BY nome LIMIT 1")
    pf = q(f"SELECT id FROM public.produtos WHERE owner_organization_id='{FSF}' ORDER BY nome LIMIT 1")
    mf = q(f"SELECT id FROM public.microrganismos WHERE owner_organization_id='{FSF}' ORDER BY nome LIMIT 1")
    ma = q(f"SELECT id FROM public.microrganismos WHERE owner_organization_id='{ARB}' ORDER BY nome LIMIT 1")
    tpa = q(f"INSERT INTO public.product_technical_profiles(produto_id) VALUES ('{pa}') RETURNING id").splitlines()[-1] if pa else ""
    tpf = q(f"INSERT INTO public.product_technical_profiles(produto_id, explicacao_b2b) VALUES ('{pf}', 'original FSF') RETURNING id").splitlines()[-1]
    c("FEN-0", "10 consumidores DEFINER cercados registrados no ledger", "10", q("SELECT count(*) FROM platform_private.tenant_catalog_migration_ledger WHERE step='definer_tenant_fenced'"))
    r = pg.sql(as_user(UA) + f"SELECT public.update_product_b2b_description('{tpf}', 'invasão');", ok=False)
    c("FEN-1", "update_product_b2b_description (corpo LIVE): gestor AR Bio NÃO grava perfil técnico FSF", True, "tenant_catalog_fence_denied" in r)
    c("FEN-1b", "perfil FSF intacto após tentativa", "original FSF", q(f"SELECT explicacao_b2b FROM public.product_technical_profiles WHERE id='{tpf}'"))
    r = pg.sql(as_user(UA) + f"SELECT public.update_product_b2b_description('{tpa}', 'texto ARB');", ok=False)
    c("FEN-2", "update_product_b2b_description: gestor AR Bio grava o próprio perfil (núcleo LIVE executado)", "texto ARB",
      q(f"SELECT explicacao_b2b FROM public.product_technical_profiles WHERE id='{tpa}'") if not r.startswith("ERR") else r[:200])
    r = pg.sql(as_user(UB2B) + f"SELECT public.update_product_b2b_description('{tpf}', 'leitor');", ok=False)
    c("FEN-3", "leitor sem 'mutate' negado na cerca (mesmo no próprio tenant)", True, "tenant_catalog_fence_denied" in r)
    r = pg.sql(as_user(USA) + f"SELECT public.update_product_b2b_description('{tpa}', 'sa');", ok=False)
    c("FEN-4", "Superadmin sem bypass na cerca", True, "tenant_catalog_fence_denied" in r)
    r = pg.sql(as_user(UA) + f"SELECT public.approve_product_profile_with_audit('{tpf}', '{{}}'::jsonb, false);", ok=False)
    c("FEN-5", "approve_product_profile_with_audit: perfil de outro tenant negado antes do núcleo", True, "tenant_catalog_fence_denied" in r)
    r = pg.sql(as_user(UA) + f"SELECT public.rpc_regulatory_dossier_ensure_draft('{mf}');", ok=False)
    c("FEN-6", "rpc_regulatory_dossier_ensure_draft: microrganismo FSF negado ao gestor AR Bio", True, "tenant_catalog_fence_denied" in r)
    r = pg.sql(as_user(UA) + f"SELECT public.fn_catalogo_preco_canonico('{pf}', NULL, 'litro', NULL);", ok=False)
    c("FEN-7", "fn_catalogo_preco_canonico: preço de produto FSF negado ao ator AR Bio", True, "tenant_catalog_fence_denied" in r)
    r = pg.sql(as_user(UA) + f"SELECT public.fn_catalogo_preco_canonico('{pa}', NULL, 'litro', NULL);", ok=False)
    c("FEN-8", "fn_catalogo_preco_canonico: próprio produto passa a cerca (erro, se houver, vem do núcleo, não da cerca)", True, "tenant_catalog_fence_denied" not in r)
    r = pg.sql(as_user(UA) + f"SELECT public.rpc_commercial_simulator('{H.PF}', '{pf}', 1, 0);", ok=False)
    c("FEN-9", "rpc_commercial_simulator: parceiro AR Bio + produto FSF (tenants divergentes) negado", True, "tenant_catalog_fence_denied" in r)
    r = pg.sql(f"RESET ROLE; SET test.uid=''; SELECT public.fn_catalogo_preco_canonico('{pf}', NULL, 'litro', NULL);", ok=False)
    c("FEN-10", "contexto servidor sem ator (gatilho/serviço como dono) não é bloqueado pela cerca", True, "tenant_catalog_fence_denied" not in r)
    r = pg.sql(as_user(None, "anon") + f"SELECT public.fn_catalogo_preco_canonico('{pa}', NULL, 'litro', NULL);", ok=False)
    c("FEN-11", "anon sem EXECUTE no invólucro", True, "permission denied" in r)
    r = pg.sql(as_user(UA) + f"SELECT platform_private.update_product_b2b_description__tenant_core('{tpf}', 'x');", ok=False)
    c("FEN-12", "núcleo privado sem EXECUTE para authenticated (cerca não contornável)", True, "permission denied" in r)
    r = pg.sql(as_user(UA) + "SELECT public.platform_set_catalog_label_active(gen_random_uuid(), now(), true, 'motivo de teste', gen_random_uuid());", ok=False)
    c("FEN-13", "writer global platform_set_catalog_label_active fechado (sem EXECUTE)", True, "permission denied" in r)
    c("FEN-14", "assinaturas/defaults preservados (invólucro = mesma identidade do original)", "p_product_id uuid, p_microrganismo_id uuid, p_unit_type text, p_volume_ml numeric DEFAULT NULL::numeric",
      q("SELECT pg_get_function_arguments('public.fn_catalogo_preco_canonico(uuid,uuid,text,numeric)'::regprocedure)"))
    r = pg.sql(as_user(UA) + f"SELECT public.update_microorganism_b2b_description(gen_random_uuid(), 'x');", ok=False)
    c("FEN-15", "id inexistente negado (sem oráculo de existência)", True, "tenant_catalog_fence_denied" in r)


def run_fin_assoc(pg, q, check, as_user, val):
    """DECISÃO HUMANA 02/11: Financeiro associa produto fiscal a microrganismo SOMENTE na própria empresa; sem CRUD geral."""
    import subprocess, time
    c = lambda cid, scen, exp, act: check(cid, scen, exp, act, kind=KIND)
    ARB, FSF, USA = H.ARB, H.FSF, H.USA
    UFIN, UNR, UFIN2 = H.U(906), H.U(907), H.U(908)
    q(f"""INSERT INTO platform_private.members VALUES ('{UFIN}','{ARB}',false,false),('{UNR}','{ARB}',false,false),('{UFIN2}','{ARB}',false,false);
INSERT INTO platform_private.test_roles VALUES ('{UFIN}','financeiro'),('{UNR}','cliente'),('{UFIN2}','financeiro');""")
    pa = q(f"SELECT id FROM public.produtos WHERE owner_organization_id='{ARB}' ORDER BY nome LIMIT 1")
    pf = q(f"SELECT id FROM public.produtos WHERE owner_organization_id='{FSF}' ORDER BY nome LIMIT 1")
    ma = q(f"SELECT id FROM public.microrganismos WHERE owner_organization_id='{ARB}' ORDER BY nome LIMIT 1")
    mf = q(f"SELECT id FROM public.microrganismos WHERE owner_organization_id='{FSF}' ORDER BY nome LIMIT 1")
    cur = lambda m: q(f"SELECT coalesce(product_id::text,'NULL') FROM public.microrganismos WHERE id='{m}'")
    assoc = lambda u, m, p, role="authenticated": pg.sql(as_user(u, role) + f"SELECT id||'>'||coalesce(product_id::text,'NULL') FROM public.rpc_associate_microorganism_fiscal_product('{m}', {('NULL' if p is None else repr(p))}::uuid);", ok=False)
    before_ma, before_mf = cur(ma), cur(mf)
    r = assoc(UFIN, ma, pa)
    c("FIN-1", "Financeiro AR Bio associa micro AR Bio a produto AR Bio (própria empresa)", f"{ma}>{pa}", val(r) if not r.startswith("ERR") else r[:200])
    r = assoc(UFIN, ma, None)
    c("FIN-2", "Financeiro AR Bio desassocia (NULL) na própria empresa", f"{ma}>NULL", val(r) if not r.startswith("ERR") else r[:200])
    r = assoc(UFIN, ma, pf)
    c("FIN-3", "par misto: micro AR Bio + produto FSF negado (sem oráculo), micro intacto", "True|NULL", f"{'product_not_found' in r}|{cur(ma)}")
    r = assoc(UFIN, mf, pa)
    c("FIN-4", "par misto: micro FSF + produto AR Bio negado, micro FSF intacto", f"True|{before_mf}", f"{'not_found' in r}|{cur(mf)}")
    r = assoc(UFIN, mf, pf)
    c("FIN-5", "micro e produto alheios (FSF) negados ao Financeiro AR Bio", f"True|{before_mf}", f"{'not_found' in r}|{cur(mf)}")
    r = assoc(UFIN, H.U(999999), pa)
    c("FIN-6", "micro inexistente: mesmo erro do alheio (sem oráculo de existência)", True, "not_found" in r)
    r = assoc(UNR, ma, pa)
    c("FIN-7", "perfil não autorizado (cliente) negado", "True|NULL", f"{'catalog_fiscal_association_role_denied' in r}|{cur(ma)}")
    r = assoc(USA, ma, pa)
    c("FIN-8", "Superadmin negado (sem bypass)", "True|NULL", f"{'platform_actor_denied' in r}|{cur(ma)}")
    r = assoc(None, ma, pa, "anon")
    c("FIN-9", "anon sem EXECUTE", True, "permission denied" in r)
    r = pg.sql(as_user(UFIN) + f"SELECT platform_private.catalog_fiscal_association_actor();", ok=False)
    c("FIN-10", "helper privado de autorização sem EXECUTE para authenticated", True, "permission denied" in r)
    # Financeiro NÃO ganha CRUD geral do catálogo
    r = pg.sql(as_user(UFIN) + "SELECT platform_private.catalog_tenant_actor('mutate');", ok=False)
    c("FIN-11", "Financeiro não obtém ator 'mutate' (helper fechado ou papel negado)", True, r.startswith("ERR"))
    r = pg.sql(as_user(UFIN) + f"UPDATE public.produtos SET nome='Fin invadiu' WHERE id='{pa}';", ok=False)
    c("FIN-12", "Financeiro não altera produto diretamente (0 linhas ou negado)", True, r.startswith("ERR") or q(f"SELECT nome FROM public.produtos WHERE id='{pa}'") != "Fin invadiu")
    r = pg.sql(as_user(UFIN) + f"UPDATE public.microrganismos SET nome='Fin invadiu' WHERE id='{ma}';", ok=False)
    c("FIN-13", "Financeiro não altera microrganismo diretamente (0 linhas ou negado)", True, r.startswith("ERR") or q(f"SELECT nome FROM public.microrganismos WHERE id='{ma}'") != "Fin invadiu")
    n0 = q("SELECT count(*) FROM public.produtos")
    r = pg.sql(as_user(UFIN) + "SELECT public.tenant_product_save(NULL, '{\"nome\":\"Fin\",\"tipo\":\"inoculante\"}'::jsonb, NULL, '" + H.U(777777) + "'::uuid);", ok=False)
    c("FIN-14", "Financeiro não cria produto pelo CRUD do tenant (writer exige 'mutate'), nada gravado", "True|" + n0,
      f"{'role_denied' in r}|{q('SELECT count(*) FROM public.produtos')}")
    # espera concorrente: lock no micro, mudança de autorização durante a espera, depois liberação
    def during_wait(change_sql, cid, scen):
        hold = subprocess.Popen(["psql", "-X", "-q", "-At", "-h", pg.d, "-p", pg.port, "-U", "postgres", "-d", "postgres"],
                                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        hold.stdin.write(f"BEGIN; SELECT 1 FROM public.microrganismos WHERE id='{ma}' FOR UPDATE; SELECT pg_sleep(2); {change_sql} COMMIT;\n"); hold.stdin.close()
        time.sleep(0.6)
        r = assoc(UFIN2, ma, pa); hold.wait(timeout=30)
        c(cid, scen, "True|NULL", f"{r.startswith('ERR')}|{cur(ma)}")
        return r
    r = during_wait(f"DELETE FROM platform_private.test_roles WHERE user_id='{UFIN2}';", "FIN-15",
                    "revogação do papel Financeiro durante a espera do lock: reautorização nega, nada gravado")
    c("FIN-15b", "erro da revogação vem da reautorização (papel negado)", True, "catalog_fiscal_association_role_denied" in r)
    q(f"INSERT INTO platform_private.test_roles VALUES ('{UFIN2}','financeiro');")
    r = during_wait(f"UPDATE platform_private.members SET org='{FSF}' WHERE user_id='{UFIN2}';", "FIN-16",
                    "troca de empresa do Financeiro durante a espera: reautorização nega (tenant mudou), nada gravado")
    c("FIN-16b", "erro da troca de tenant é catalog_actor_changed (40001)", True, "catalog_actor_changed" in r)
    q(f"UPDATE platform_private.members SET org='{ARB}' WHERE user_id='{UFIN2}';")
    r = assoc(UFIN2, ma, pa)
    c("FIN-17", "após restauração legítima o Financeiro volta a associar (controle positivo do cenário de espera)", f"{ma}>{pa}", val(r) if not r.startswith("ERR") else r[:200])


def run_ae(pg, q, check, as_user, val):
    """Revisão 02/11 A/E: ids de catálogo de OUTRA empresa forjados no payload/parâmetro/pai. Status sempre 'rascunho';
    nenhum envio ao gestor/aviso externo é exercitado (enviada_gestor nunca é usado)."""
    c = lambda cid, scen, exp, act: check(cid, scen, exp, act, kind=KIND)
    ARB, FSF, UA, UF, USA = H.ARB, H.FSF, H.UA, H.UF, H.USA
    UT = str(uuid.UUID(int=0xAE000001))   # técnico B2B sintético do parceiro FSF (vendedor = AR Bio)
    q(f"INSERT INTO auth.users(id) VALUES ('{UT}') ON CONFLICT DO NOTHING; INSERT INTO platform_private.members VALUES ('{UT}','{FSF}',false,false);"
      f" INSERT INTO platform_private.test_roles VALUES ('{UT}','parceiro_b2b_tecnico');")
    pa = q(f"SELECT id FROM public.produtos WHERE owner_organization_id='{ARB}' AND ativo ORDER BY nome LIMIT 1")
    pf = q(f"SELECT id FROM public.produtos WHERE owner_organization_id='{FSF}' ORDER BY nome LIMIT 1")
    mf = q(f"SELECT id FROM public.microrganismos WHERE owner_organization_id='{FSF}' ORDER BY nome LIMIT 1")
    cf = q(f"SELECT id FROM public.culturas WHERE owner_organization_id='{FSF}' ORDER BY nome LIMIT 1")
    q(f"UPDATE public.produtos SET b2b_enabled=true, ativo=true WHERE id IN ('{pa}','{pf}'); UPDATE public.microrganismos SET b2b_enabled=true, ativo=true WHERE id='{mf}';")
    c("AE-0", "deltas pinados A/E aplicados (14 funções: +agregadora regulatória v2.12) e guardas de tabela-pai registradas", "14|true",
      q("SELECT (SELECT count(*) FROM platform_private.tenant_catalog_migration_ledger WHERE step='ae_owner_delta')||'|'||"
        "((SELECT count(*) FROM platform_private.tenant_catalog_migration_ledger WHERE step='catalog_parent_guard')>=15)::text"))
    # --- b2b_save_technical_simulation: produto/micro FSF forjado com parceiro da AR Bio
    def sim(item, kind):
        p = json.dumps({"partner_id": H.PF, "status": "rascunho", "titulo": "AE", "items": [{"item_id": item, "item_tipo": kind, "quantidade": 1}]})
        return pg.sql(as_user(UT) + f"SELECT platform_private.b2b_save_technical_simulation('{p}'::jsonb)::text;", ok=False)
    q(f"GRANT EXECUTE ON FUNCTION platform_private.b2b_save_technical_simulation(jsonb) TO authenticated;")  # só no harness: chamada direta do núcleo
    # STUB SINTÉTICO declarado: o helper real de visibilidade do parceiro exige profiles/user_roles/organizations não capturados;
    # aqui só o técnico UT enxerga o parceiro PF. A autorização do parceiro NÃO é objeto deste teste (o delta é o filtro de dono).
    vis_orig = q("SELECT pg_get_functiondef('platform_private.b2b_phase1_partner_visible(uuid,boolean)'::regprocedure)")
    q(f"""CREATE OR REPLACE FUNCTION platform_private.b2b_phase1_partner_visible(p_partner uuid, p_technical boolean DEFAULT false) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $f$ SELECT auth.uid() = '{UT}'::uuid AND p_partner = '{H.PF}'::uuid AND p_technical $f$;""")
    # fixture sintética: perfil ativo do técnico na empresa do vendedor (modelo real: profiles.organization_id = partner_users.tenant_id = dono)
    pg.sql(f"RESET ROLE; INSERT INTO public.profiles(user_id, organization_id, ativo) VALUES ('{UT}','{ARB}',true);", ok=False)
    r = sim(pf, "produto"); c("AE-1", "simulação técnica: produto FSF forjado com parceiro AR Bio => product_unavailable (sem gravação)", True, "product_unavailable" in r)
    r = sim(mf, "microrganismo"); c("AE-2", "simulação técnica: microrganismo FSF forjado => product_unavailable", True, "product_unavailable" in r)
    c("AE-2b", "nenhum item alheio gravado em partner_simulation_items", "0", q(f"SELECT count(*) FROM public.partner_simulation_items WHERE item_id IN ('{pf}','{mf}')"))
    r = sim(pa, "produto"); c("AE-3", "simulação técnica: produto do vendedor AR Bio aceito (rascunho; erro, se houver, não é product_unavailable)", True, "product_unavailable" not in r)
    c("AE-3b", "simulação criada fica em rascunho (sem envio ao gestor)", "0", q("SELECT count(*) FROM public.partner_simulations WHERE status::text <> 'rascunho'"))
    q(vis_orig + ";")   # helper real restaurado byte-exato
    c("AE-3c", "helper real de visibilidade do parceiro restaurado após o stub", vis_orig, q("SELECT pg_get_functiondef('platform_private.b2b_phase1_partner_visible(uuid,boolean)'::regprocedure)"))
    # --- catalog_tenant_selection_core: seleção AR Bio não lista FSF nem devolve include_ids alheios
    q("GRANT EXECUTE ON FUNCTION platform_private.catalog_tenant_selection_core(text,text,integer,integer,uuid[]) TO authenticated;")
    for ent, alien in (("produto", pf), ("microrganismo", mf), ("cultura", cf)):
        r = pg.sql(as_user(UA) + f"SELECT count(*) FROM platform_private.catalog_tenant_selection_core('{ent}', NULL, 100, 0, NULL) s"
                   f" WHERE s.id NOT IN (SELECT id FROM public.{ {'produto':'produtos','microrganismo':'microrganismos','cultura':'culturas'}[ent] } WHERE owner_organization_id='{ARB}');", ok=False)
        c(f"AE-4-{ent}", f"seleção AR Bio ({ent}): zero itens de outra empresa na página", "0", val(r) if not r.startswith("ERR") else r[:200])
        r = pg.sql(as_user(UA) + f"SELECT count(*) FROM platform_private.catalog_tenant_selection_core('{ent}', NULL, 1, 0, ARRAY['{alien}']::uuid[]) s WHERE s.id='{alien}';", ok=False)
        c(f"AE-5-{ent}", f"seleção AR Bio ({ent}): include_ids de outra empresa não volta", "0", val(r) if not r.startswith("ERR") else r[:200])
    r = pg.sql(as_user(UA) + f"SELECT max(total) FROM platform_private.catalog_tenant_selection_core('produto', NULL, 100, 0, NULL);", ok=False)
    c("AE-6", "seleção AR Bio: total paginado conta só produtos ativos da AR Bio", q(f"SELECT count(*) FROM public.produtos WHERE owner_organization_id='{ARB}' AND ativo"), val(r) if not r.startswith("ERR") else r[:200])
    # --- catalog_tenant_set_visibility_core: ocultar item de outra empresa
    q("GRANT EXECUTE ON FUNCTION platform_private.catalog_tenant_set_visibility_core(text,uuid,boolean,integer,text,uuid) TO authenticated;")
    # TABELA SINTÉTICA declarada: o ledger de visibilidade não está em nenhuma captura; colunas = as usadas pelo corpo LIVE
    q("""CREATE TABLE IF NOT EXISTS public.catalog_tenant_visibility_ledger(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, actor_id uuid,
  idempotency_key uuid, payload_hash text, entity_type text, entity_id uuid, before_state jsonb, after_state jsonb, reason text, result jsonb)""")
    r = pg.sql(as_user(UA) + f"SELECT platform_private.catalog_tenant_set_visibility_core('produto','{pf}',true,0,'teste de auditoria','{uuid.uuid4()}')::text;", ok=False)
    c("AE-7", "visibilidade: gestor AR Bio não grava preferência sobre produto FSF (item_not_found, sem oráculo)", True, "catalog_visibility_item_not_found" in r)
    c("AE-7b", "nenhuma preferência AR Bio apontando produto FSF", "0", q(f"SELECT count(*) FROM public.catalog_tenant_visibility WHERE organization_id='{ARB}' AND produto_id='{pf}'"))
    # --- catálogo do parceiro: só itens do vendedor
    for fn, arg in (("get_partner_catalog_secure", f"'{H.PF}'::uuid"), ("get_partner_catalog_tecnico_secure", "")):
        body = q(f"SELECT pg_get_functiondef('public.{fn}({'uuid' if arg else ''})'::regprocedure) LIKE '%catalog_tenant_seller%'")
        c(f"AE-8-{fn}", f"{fn}: listagem exige dono = vendedor do parceiro (delta pinado instalado)", "t", body)
    r = pg.sql(as_user(USA) + f"SELECT count(*) FROM public.get_partner_catalog_secure('{H.PF}');", ok=False)
    c("AE-9", "Superadmin: catálogo do parceiro sem bypass (zero itens ou negado)", True, r.startswith("ERR") or val(r) == "0")
    q(f"SET test.uid='{UA}'"); s1 = q(f"SELECT platform_private.catalog_tenant_seller('{H.PF}')")
    c("AE-10", "vendedor do parceiro FSF = AR Bio (dono comercial, servidor)", ARB, s1)
    q("RESET test.uid")
    # --- guarda persistente das tabelas-pai (prova das leituras classe A "via pai"), inclusive escritor DEFINER do dono
    q("""CREATE OR REPLACE FUNCTION public.zz_ae_definer(p_sql text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
BEGIN EXECUTE p_sql; END $f$; GRANT EXECUTE ON FUNCTION public.zz_ae_definer(text) TO authenticated;""")
    ind = lambda u, stmt: pg.sql(as_user(u) + "SELECT public.zz_ae_definer($s$" + stmt + "$s$);", ok=False)
    # Para cada tabela-pai guardada com fixture: aponta um registro para produto de OUTRA empresa.
    # Demais gatilhos da tabela são suspensos NOMINALMENTE só dentro da transação de teste (ROLLBACK), pois vários
    # dependem de relações ausentes na captura (ex.: organization_subscriptions); a guarda permanece ativa.
    gt = q("SELECT string_agg(detail->>'table', ',' ORDER BY detail->>'table') FROM platform_private.tenant_catalog_migration_ledger WHERE step='catalog_parent_guard'").split(",")
    exercised = 0
    for t in gt:
        col = q(f"SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='{t}' AND column_name IN ('produto_id','product_id','produto_biologico_sugerido_id') ORDER BY 1 LIMIT 1")
        if not col: continue
        rid = q(f"SELECT x.id::text FROM public.{t} x JOIN public.produtos z ON z.id = x.{col} LIMIT 1")
        others = q(f"SELECT coalesce(string_agg(format('ALTER TABLE public.%I DISABLE TRIGGER %I;', '{t}', tgname), ' '), '') FROM pg_trigger WHERE tgrelid='public.{t}'::regclass AND NOT tgisinternal AND tgname NOT LIKE '%catalog_tenant_guard'")
        fixture_note = ""
        if not rid and t in AE11_FIXTURES:
            # v2.11: fixture SINTÉTICA por transação (ROLLBACK), pais REAIS da AR Bio já semeados; a própria guarda
            # valida o INSERT (produto AR Bio aceito) antes do UPDATE de teste; demais gatilhos da tabela e das
            # tabelas-pai auxiliares suspensos NOMINALMENTE só dentro da transação (mesma regra dos cenários existentes).
            rid = str(uuid.UUID(int=0xAE110000 + len(t)))
            own = q(f"SELECT id FROM public.produtos WHERE owner_organization_id='{ARB}' ORDER BY nome LIMIT 1")
            pre_tabs, ins = AE11_FIXTURES[t](rid, own)
            aux = "".join(q(f"SELECT coalesce(string_agg(format('ALTER TABLE public.%I DISABLE TRIGGER %I;', '{a}', tgname), ' '), '') FROM pg_trigger WHERE tgrelid='public.{a}'::regclass AND NOT tgisinternal AND tgname NOT LIKE '%catalog_tenant_guard'") + " " for a in pre_tabs)
            others = others + " " + aux + (H.FX_SET or "") + "\n" + ins + "\n" + (H.FX_DROP or "") + "\n"
            chk = pg.sql(f"RESET ROLE; BEGIN; {others} SELECT count(*) FROM public.{t} WHERE id='{rid}'; ROLLBACK;", ok=False)
            if chk.startswith("ERR") or val(chk) != "1":
                c(f"AE-11-{t}", f"guarda {t}: fixture sintética por transação não montou (NÃO exercitado)", "fixture", chk[:300]); continue
            fixture_note = " [fixture sintética por transação, pais AR Bio reais]"
            alien = q(f"SELECT id FROM public.produtos WHERE owner_organization_id <> '{ARB}' ORDER BY nome LIMIT 1")
        elif not rid:
            c(f"AE-11-{t}", f"guarda {t}: sem fixture com produto (NÃO exercitado)", "fixture", "ausente"); continue
        else:
            alien = q(f"SELECT id FROM public.produtos WHERE owner_organization_id <> (SELECT z.owner_organization_id FROM public.{t} x JOIN public.produtos z ON z.id=x.{col} WHERE x.id='{rid}') ORDER BY nome LIMIT 1")
            own = q(f"SELECT x.{col} FROM public.{t} x WHERE x.id='{rid}'")
        r = pg.sql(f"RESET ROLE; BEGIN; {others} " + as_user(UA) + f"SELECT public.zz_ae_definer($s$UPDATE public.{t} SET {col}='{alien}' WHERE id='{rid}'$s$); ROLLBACK;", ok=False)
        c(f"AE-11-{t}", f"guarda {t}: escritor DEFINER (ator AR Bio) não aponta o registro para produto de outra empresa{fixture_note}", True, "tenant_catalog_cross_tenant_reference" in r)
        r = pg.sql(f"RESET ROLE; BEGIN; {others} SET test.uid=''; UPDATE public.{t} SET {col}='{alien}' WHERE id='{rid}'; ROLLBACK;", ok=False)
        c(f"AE-13-{t}", f"guarda {t}: contexto servidor/dono sem ator também bloqueado (invariante)", True, "tenant_catalog_cross_tenant_reference" in r)
        r = pg.sql(f"RESET ROLE; BEGIN; {others} SET test.uid=''; UPDATE public.{t} SET {col}='{own}' WHERE id='{rid}'; ROLLBACK;", ok=False)
        c(f"AE-14-{t}", f"guarda {t}: produto da própria empresa do registro aceito", True, "tenant_catalog_cross_tenant_reference" not in r and not r.startswith("ERR"))
        exercised += 1
    r = pg.sql(f"RESET ROLE; BEGIN; " + q("SELECT coalesce(string_agg(format('ALTER TABLE public.lotes DISABLE TRIGGER %I;', tgname), ' '), '') FROM pg_trigger WHERE tgrelid='public.lotes'::regclass AND NOT tgisinternal AND tgname NOT LIKE '%catalog_tenant_guard'")
               + as_user(USA) + f"SELECT public.zz_ae_definer($s$UPDATE public.lotes SET produto_id='{pf}' WHERE id='{H.LOTA}'$s$); ROLLBACK;", ok=False)
    c("AE-12", "guarda: Superadmin sem bypass (lote AR Bio -> produto FSF)", True, "tenant_catalog_cross_tenant_reference" in r)
    c("AE-12b", "guardas exercitadas em pelo menos 5 tabelas-pai com fixture", True, exercised >= 5)
    gt_all = [t for t in gt if t]
    c("AE-12c", "guarda persistente exercitada em TODAS as tabelas-pai com coluna de produto (sem lacuna de fixture)", True,
      exercised == sum(1 for t in gt_all if q(f"SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='{t}' AND column_name IN ('produto_id','product_id','produto_biologico_sugerido_id')") != "0"))
    for sig in ("public.rpc_b2b_executive_dashboard()", "public.rpc_b2b_carteira_kpis(date,date)", "public.rpc_b2b_revenue_forecast(uuid)"):
        c(f"AGG-CLOSED:{sig.split('(')[0]}", "agregadora B2B sem filtro de empresa: EXECUTE fechado para anon/authenticated/PUBLIC após migração (ledger)",
          "false|false|1", q(f"SELECT has_function_privilege('authenticated','{sig}','EXECUTE')||'|'||has_function_privilege('anon','{sig}','EXECUTE')||'|'||"
                             f"(SELECT count(*) FROM platform_private.tenant_catalog_migration_ledger WHERE step='tenantless_aggregator_closed' AND detail->>'function'='{sig}')"))
    # --- v2.11: execução POSITIVA real dos deltas de envase/etiqueta (ator gestor AR Bio, lote AR Bio real), BEGIN…ROLLBACK
    pa_own = q(f"SELECT id FROM public.produtos WHERE owner_organization_id='{ARB}' AND ativo IS NOT FALSE ORDER BY nome LIMIT 1")
    pf_alien = q(f"SELECT id FROM public.produtos WHERE owner_organization_id<>'{ARB}' ORDER BY nome LIMIT 1")
    # v2.12: sequências e etiqueta_templates agora são REAIS (captura v2.11). Só a LINHA de configuração do modelo de
    # etiqueta é dado de FIXTURE (sem linhas capturadas), com todas as colunas NOT NULL reais e CHECKs reais ativos.
    # extensão real da plataforma (Supabase: pgcrypto no schema extensions) — ambiente, não stub
    STUB_TX = ("CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions; "
               "INSERT INTO public.etiqueta_templates(codigo,nome,largura_mm,altura_mm,ativo,versao) "
               "VALUES ('etiqueta-produto-principal','Etiqueta produto (fixture)',100,50,true,1);")
    POS_DETAIL["synthetic_stubs_in_tx"] = STUB_TX
    def callj(fn, payload):
        return pg.sql("BEGIN;\n" + STUB_TX + "\n" + as_user(UA) + f"SELECT public.{fn}('{json.dumps(payload)}'::jsonb)::text;\nROLLBACK;", ok=False)
    emb = lambda pid: callj("rpc_criar_embalagens_pos_envase", {"lote_id": H.LOTA, "produto_id": pid, "volume": 1, "unidade": "L", "quantidade_embalagens": 1})
    r_own, r_for = emb(pa_own), emb(pf_alien)
    c("AE-POS-1", "rpc_criar_embalagens_pos_envase: produto de OUTRA empresa no lote AR Bio recusado como inexistente (sem oráculo)", True,
      r_for.startswith("ERR") and "Produto informado não existe" in r_for)
    c("AE-POS-2", "rpc_criar_embalagens_pos_envase: produto da própria empresa executa com sucesso (positivo real; sequência de código = stub sintético declarado)", "OK",
      "OK" if not r_own.startswith("ERR") else r_own.split("CONTEXT")[0][:220])
    et = lambda pid: callj("rpc_gerar_etiqueta_produto", {"lote_id": H.LOTA, "produto_id": pid, "tipo_etiqueta": "interna"})
    r_own, r_for = et(pa_own), et(pf_alien)
    c("AE-POS-3", "rpc_gerar_etiqueta_produto: produto de OUTRA empresa no lote AR Bio negado (etiqueta_produto_tenant_denied)", True,
      "etiqueta_produto_tenant_denied" in r_for)
    c("AE-POS-4", "rpc_gerar_etiqueta_produto: produto da própria empresa gera etiqueta interna com sucesso (positivo real; sequência/template = stubs declarados)", "OK",
      "OK" if not r_own.startswith("ERR") else r_own.split("CONTEXT")[0][:220])
    POS_DETAIL.update({"embalagens_own": emb(pa_own)[:400], "etiqueta_own": r_own[:400]})
    # --- deltas restantes: instalados exatamente (corpo contém o dono canônico); execução positiva depende de helpers h15/estoque
    for sig, frag in (("public.rpc_criar_embalagens_pos_envase(jsonb)", "owner_organization_id = (SELECT l.organization_id FROM public.lotes l WHERE l.id = v_lote)"),
                      ("public.rpc_gerar_etiqueta_produto(jsonb)", "etiqueta_produto_tenant_denied"),
                      ("public.rpc_fiscal_draft_save(uuid,jsonb,jsonb,integer)", "pr.owner_organization_id = public.h15_actor_organization()"),
                      ("public.rpc_salvar_aplicacao_v1(uuid,jsonb,uuid,jsonb,uuid[])", "owner_organization_id=org FOR SHARE"),
                      ("platform_private.storage1_application_allowed(text,text)", "AND owner_organization_id=org)"),
                      ("public.rpc_converter_visita_em_os(uuid,text)", "p.owner_organization_id=(SELECT cl.organization_id"),
                      ("public.tenant_catalog_visit_selection_page(uuid,text,text,integer,integer,uuid[])", "m.owner_organization_id=v_org")):
        c(f"AE-15:{sig.split('(')[0]}", "delta pinado instalado (estático; execução positiva não comprovada aqui)", "t",
          q(f"SELECT position($x${frag}$x$ in pg_get_functiondef('{sig}'::regprocedure)) > 0"))
    c("AE-16", "nenhum corpo A/E mantém filtro 'global' (owner IS NULL) após a migração", "0",
      q("SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname||'.'||p.proname IN ("
        "'public.rpc_converter_visita_em_os','public.tenant_catalog_visit_selection_page') AND (prosrc LIKE '%owner_organization_id'') IS NULL%' OR prosrc LIKE '%>>''owner_organization_id'' IS NULL%')"))
    c("AE-16b", "inventário: outros DEFINER com filtro 'global' por owner IS NULL (listados para revisão)", "[]",
      q("SELECT coalesce(json_agg(n.nspname||'.'||p.proname ORDER BY 1)::text,'[]') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE prosecdef AND n.nspname IN ('public','platform_private') AND (prosrc LIKE '%owner_organization_id'') IS NULL%' OR prosrc LIKE '%>>''owner_organization_id'' IS NULL%')"))
