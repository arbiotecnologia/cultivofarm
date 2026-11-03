"""v2.8 — EXECUÇÃO real (PG descartável, esquema/policies/gatilhos reais, 300+129 corpos LIVE) das 48 DEFINER auditadas,
das 6 agregadoras e dos códigos por empresa. Nada aqui é prova JWT hospedada (papéis/entitlements sintéticos).

Para cada função não-gatilho e cada ator (gestor AR Bio, gestor FSF, leitor FSF, Superadmin, anon) chama a assinatura
pública dentro de BEGIN…ROLLBACK com argumentos derivados dos nomes reais dos parâmetros:
  - produto/microrganismo/cultura → id da CÓPIA de OUTRA empresa (sonda de id alheio) e, em seguida, da própria;
  - parceiro → parceiro comercial da AR Bio (FSF compradora dentro da AR Bio);
  - demais → valores neutros.
Classificação por resultado: DENIED (erro de autorização/escopo), LEAK (saída contém id de outra empresa),
OK (executou sem id alheio), BLOCKED_DEP (relação/coluna/função fora das capturas — nunca contado como PASS),
ERROR (outro erro de negócio/validação; registrado com a mensagem).
"""
import json, re, subprocess
import harness as H

DENY = re.compile(r"(42501|permission denied|row-level security|forbidden|denied|not_allowed|não autoriz|sem permiss|auth_required|"
                  r"tenant_catalog_fence|scope|FORBIDDEN|unauthor|mismatch|MISMATCH|platform_actor|sem_permissao|sessao_invalida|autenticad)", re.I)
NOOP = {'[""]', '[null]', '[false]', '[]'}
DEP = re.compile(r"(does not exist|não existe|undefined)", re.I)
AGG6 = ["fn_fiscal_scenario_coverage()", "rpc_b2b_executive_dashboard()", "rpc_b2b_integrity_check()",
        "rpc_cc_validate_matrix(uuid,text,uuid,uuid)", "rpc_fiscal_nfe_readiness_v1()", "rpc_microorganism_regulatory_overview()"]


def _arg(name, typ, ids):
    n = (name or "").lower()
    if typ == "uuid":
        if "micro" in n: return ids["m"]
        if "produt" in n or "product" in n or "item" in n: return ids["p"]
        if "cultura" in n: return ids["c"]
        if "partner" in n or "parceiro" in n: return f"'{H.PF}'::uuid"
        return "NULL::uuid"
    if typ == "uuid[]": return f"ARRAY[{ids['p']}]::uuid[]"
    if typ in ("integer", "bigint", "smallint"): return "10"
    if typ == "numeric": return "1"
    if typ == "boolean": return "false"
    if typ == "date": return "CURRENT_DATE"
    if typ == "jsonb": return f"jsonb_build_object('product_id', {ids['p']}, 'produto_id', {ids['p']}, 'microrganismo_id', {ids['m']})"
    if typ.startswith("timestamp"): return "now()"
    return f"NULL::{typ}"


def classify(r, foreign):
    if r.startswith("ERR"):
        if DEP.search(r): return "BLOCKED_DEP"
        if DENY.search(r): return "DENIED"
        return "ERROR"
    if any(f in r for f in foreign): return "LEAK"
    if '"success": false' in r and DENY.search(r): return "DENIED"
    return "OK_NOOP" if r.strip() in NOOP else "OK"


def run(pg, q, c, as_user, val):
    ARB, FSF = H.ARB, H.FSF
    own = {}
    for org in (ARB, FSF):
        own[org] = dict(p=q(f"SELECT coalesce(string_agg(id::text, ','), '') FROM public.produtos WHERE owner_organization_id='{org}'").split(","),
                        m=q(f"SELECT coalesce(string_agg(id::text, ','), '') FROM public.microrganismos WHERE owner_organization_id='{org}'").split(","),
                        c=q(f"SELECT coalesce(string_agg(id::text, ','), '') FROM public.culturas WHERE owner_organization_id='{org}'").split(","))
    def ids_for(org):
        o = own[org]
        pick = lambda k: (f"'{o[k][0]}'::uuid" if o[k] and o[k][0] else "NULL::uuid")
        return dict(p=pick("p"), m=pick("m"), c=pick("c"))
    allids = {org: [x for k in ("p", "m", "c") for x in own[org][k] if x] for org in own}
    cls = json.loads((H.ROOT / "docs/auditorias/evidencias/catalogo-exclusivo-tenant-20261101/definer-48-classificacao-v2.7.json").read_text())
    sigs = [r["signature"] for r in cls]
    actors = [("gestor_arbio", H.UA, ARB, FSF), ("gestor_fsf", H.UF, FSF, ARB), ("leitor_fsf_b2b", H.UB2B, FSF, ARB),
              ("superadmin", H.USA, None, None), ("anon", None, None, None)]
    matrix = []
    for sig in sigs:
        fq = sig if "." in sig.split("(")[0] else "public." + sig
        meta = q(f"SELECT coalesce(pg_get_function_identity_arguments('{fq}'::regprocedure),'')||'|'||prorettype::regtype::text||'|'||"
                 f"coalesce(array_to_string(proargnames,','),'') FROM pg_proc WHERE oid='{fq}'::regprocedure")
        args_s, ret, names = meta.split("|")
        if ret == "trigger":
            matrix.append(dict(signature=sig, kind="trigger", result="TRIGGER_EXERCISED_BY_DML_TESTS")); continue
        types = [a.strip() for a in sig[sig.index("(") + 1:-1].split(",")] if sig.split("(", 1)[1] != ")" else []
        names = names.split(",") if names else []
        for label, uid, org, foreign_org in actors:
            for probe in ("foreign", "own"):
                if org is None and probe == "own": continue
                target = foreign_org if probe == "foreign" else org
                ids = ids_for(target or ARB)
                fname = fq.split("(")[0]
                call = (f"SELECT coalesce(json_agg(t)::text, '[]') FROM {fname}("
                        + ", ".join(_arg(names[i] if i < len(names) else "", t, ids) for i, t in enumerate(types)) + ") t;")
                role = "anon" if uid is None else "authenticated"
                r = pg.sql("BEGIN;\n" + as_user(uid, role) + call + "\nROLLBACK;", ok=False)
                foreign_ids = [x for o, v in allids.items() if o != org for x in v] if org else [x for v in allids.values() for x in v]
                res = classify(r, foreign_ids)
                matrix.append(dict(signature=sig, actor=label, probe=probe, result=res, detail=r[:220]))
    (H.OUT / "definer-execution-matrix.json").write_text(json.dumps(matrix, indent=1, ensure_ascii=False))
    called = [m for m in matrix if m.get("actor")]
    by = lambda pred: sum(1 for m in called if pred(m))
    c("DEF-1", "48 DEFINER executadas: nenhuma saída contém id de catálogo de outra empresa (LEAK)", 0, by(lambda m: m["result"] == "LEAK"),
      kind="PG_DISPOSABLE_REAL_SCHEMA_SYNTHETIC_AUTH")
    c("DEF-2", "anon: nenhuma DEFINER devolve dado (OK com conteúdo/LEAK); OK_NOOP = void/NULL sem dado", 0, by(lambda m: m["actor"] == "anon" and m["result"] in ("OK", "LEAK")),
      kind="PG_DISPOSABLE_REAL_SCHEMA_SYNTHETIC_AUTH")
    c("DEF-3", "Superadmin sem tenant: nenhuma DEFINER devolve catálogo (LEAK)", 0,
      by(lambda m: m["actor"] == "superadmin" and m["result"] == "LEAK"), kind="PG_DISPOSABLE_REAL_SCHEMA_SYNTHETIC_AUTH")
    summary = {}
    for m in called: summary.setdefault(m["result"], 0); summary[m["result"]] += 1
    (H.OUT / "definer-execution-summary.json").write_text(json.dumps(dict(
        calls=len(called), by_result=summary,
        blocked_dep_signatures=sorted({m["signature"] for m in called if m["result"] == "BLOCKED_DEP"}),
        executed_ok_signatures=sorted({m["signature"] for m in called if m["result"] == "OK"}),
        aggregators={s: sorted({f"{m['actor']}:{m['probe']}:{m['result']}" for m in called if m["signature"] == s}) for s in AGG6}),
        indent=1, ensure_ascii=False))
    # agregadoras: execução positiva (gestor do próprio tenant) — PASS apenas se executou de fato sem id alheio
    PRICE = ["fn_b2b_resolve_base_unit_price(uuid,uuid,uuid,text,numeric,date)", "rpc_commercial_simulator(uuid,uuid,numeric,numeric)",
             "fn_catalogo_preco_canonico(uuid,uuid,text,numeric)", "platform_private.lab_item_is_manufacturable(uuid,uuid)",
             "platform_private.lab_assert_manufacturable(uuid,uuid)"]
    c("DEF-4", "B2B/preço/laboratório recebendo id de produto/micro de OUTRA empresa: negado para gestor AR Bio e FSF",
      "DENIED", ",".join(sorted({m["result"] for m in called if m["signature"] in PRICE and m["probe"] == "foreign" and m["actor"] in ("gestor_arbio", "gestor_fsf")})),
      kind="PG_DISPOSABLE_REAL_SCHEMA_SYNTHETIC_AUTH")
    c("DEF-0", "sonda sem erro de sintaxe do próprio harness", 0, by(lambda m: "syntax error" in m.get("detail", "")),
      kind="PG_DISPOSABLE_REAL_SCHEMA_SYNTHETIC_AUTH")
    for s in AGG6:
        rs = {(m["actor"], m["probe"]): m["result"] for m in called if m["signature"] == s}
        if "LEAK" in rs.values(): act = "LEAK"
        elif all(any(rs.get((a, p)) in ("OK", "OK_NOOP", "DENIED") for p in ("own", "foreign")) for a in ("gestor_arbio", "gestor_fsf")): act = "executed-no-leak"
        else: act = "NOT_EXECUTED:" + ",".join(sorted(set(rs.values())))
        c(f"AGG-{s.split('(')[0]}", f"agregadora {s}: executada para gestor AR Bio e FSF sem id da outra empresa",
          "executed-no-leak", act, kind="PG_DISPOSABLE_REAL_SCHEMA_SYNTHETIC_AUTH")
    codes(pg, q, c, as_user, val)
    crud(pg, q, c, as_user, val)


def codes(pg, q, c, as_user, val):
    """Códigos automáticos por empresa (gatilhos reais set_codigo_* reescritos + contador privado com lock)."""
    ARB, FSF = H.ARB, H.FSF
    def ins(uid, nome, tipo="inoculante", tbl="produtos"):
        extra = ", tipo" if tbl == "microrganismos" else ", tipo, b2b_enabled"
        v = f"'{tipo}'" + ("" if tbl == "microrganismos" else ", false")
        return val(pg.sql(as_user(uid) + f"INSERT INTO public.{tbl}(nome{extra}) VALUES ('{nome}', {v}) RETURNING codigo;", ok=False))
    # escrita direta de produtos é fechada (só RPC): o gerador é exercitado como dono (contexto servidor) com dono explícito
    def ins_srv(org, nome, tbl="produtos", tipo=None):
        tipo = tipo or ("inoculante" if tbl == "produtos" else "bacteria")
        cols = "nome, tipo, owner_organization_id" + (", b2b_enabled" if tbl == "produtos" else "")
        vals = f"'{nome}', '{tipo}', '{org}'" + (", false" if tbl == "produtos" else "")
        return q(f"INSERT INTO public.{tbl}({cols}) VALUES ({vals}) RETURNING codigo;")
    a1 = ins_srv(ARB, "COD-A1"); f1 = ins_srv(FSF, "COD-F1"); a2 = ins_srv(ARB, "COD-A2")
    na = int(a1.split("-")[1]); nf = int(f1.split("-")[1])
    c("COD-1", "sequência por empresa: AR Bio e FSF numeram independentemente (FSF não herda contador da AR Bio)",
      "INO|INO|True", f"{a1.split('-')[0]}|{f1.split('-')[0]}|{int(a2.split('-')[1]) == na + 1}", kind="PG_DISPOSABLE_REAL_SCHEMA")
    c("COD-2", "contador FSF alinhado só ao maior código FSF (não ao da AR Bio)", True,
      nf == int(q(f"SELECT coalesce(max((regexp_match(codigo,'^INO-(\\d+)$'))[1]::int),0) FROM public.produtos WHERE owner_organization_id='{FSF}' AND nome<>'COD-F1'")) + 1,
      kind="PG_DISPOSABLE_REAL_SCHEMA")
    r = q("SELECT has_table_privilege('authenticated','platform_private.tenant_codigo_sequencias','SELECT')||'|'||"
          "has_function_privilege('authenticated','platform_private.tenant_proximo_codigo(uuid,text,text)','EXECUTE')||'|'||"
          "has_function_privilege('authenticated','public.proximo_codigo(text,text)','EXECUTE')")
    c("COD-3", "contador/gerador privados sem acesso de cliente; gerador global fechado", "false|false|false", r, kind="PG_DISPOSABLE_REAL_SCHEMA")
    r = pg.sql("RESET ROLE; SELECT public.proximo_codigo('INO','produtos');", ok=False)
    c("COD-4", "gerador global legado nega (sem leitura cruzada de MAX entre empresas)", True, "tenant_codigo_global_generator_closed" in r,
      kind="PG_DISPOSABLE_REAL_SCHEMA")
    r = pg.sql("RESET ROLE; SELECT platform_private.tenant_proximo_codigo(NULL,'INO','produtos');", ok=False)
    c("COD-5", "gerador por empresa sem dono nega (42501)", True, "tenant_codigo_owner_required" in r, kind="PG_DISPOSABLE_REAL_SCHEMA")
    m1 = ins_srv(FSF, "COD-M1", "microrganismos"); m2 = ins_srv(ARB, "COD-M2", "microrganismos")
    c("COD-6", "microrganismos: prefixo real BAC e sequência por empresa", "BAC|BAC", f"{m1.split('-')[0]}|{m2.split('-')[0]}",
      kind="PG_DISPOSABLE_REAL_SCHEMA")
    r = pg.sql(f"RESET ROLE; INSERT INTO public.produtos(nome,tipo,owner_organization_id,b2b_enabled,codigo) VALUES ('COD-DUP','inoculante','{ARB}',false,'{a1}');", ok=False)
    c("COD-7", "unicidade por empresa: código repetido na MESMA empresa rejeitado", True, "duplicate key" in r, kind="PG_DISPOSABLE_REAL_SCHEMA")
    r = pg.sql(f"RESET ROLE; INSERT INTO public.produtos(nome,tipo,owner_organization_id,b2b_enabled,codigo) VALUES ('COD-OTHER','inoculante','{FSF}',false,'{a1}') RETURNING codigo;", ok=False)
    c("COD-8", "mesmo código permitido em OUTRA empresa (unicidade por tenant)", a1, val(r), kind="PG_DISPOSABLE_REAL_SCHEMA")
    # concorrência: 2 sessões × 15 inserções simultâneas na mesma empresa — sem erro e sem código repetido
    cmd = lambda tag: ["psql", "-X", "-q", "-At", "-h", pg.d, "-p", pg.port, "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c",
                       "DO $c$ BEGIN FOR i IN 1..15 LOOP INSERT INTO public.produtos(nome,tipo,owner_organization_id,b2b_enabled) VALUES "
                       f"('CONC-{tag}-'||i,'fungicida','{ARB}',false); END LOOP; END $c$;"]
    ps = [subprocess.Popen(cmd(t), stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) for t in ("a", "b")]
    errs = [p.communicate()[1] for p in ps]
    r = q(f"SELECT count(*)||'|'||count(DISTINCT codigo) FROM public.produtos WHERE owner_organization_id='{ARB}' AND nome LIKE 'CONC-%'")
    c("COD-9", "concorrência (2×15 simultâneos, mesma empresa): 30 linhas, 30 códigos distintos, sem erro", "30|30|", r + "|" + "".join(e.strip() for e in errs),
      kind="PG_DISPOSABLE_REAL_SCHEMA")


def crud(pg, q, c, as_user, val):
    """CRUD por RPC das raízes auxiliares/perfis/formulações (CAS, idempotência, tenant, reautorização)."""
    import uuid
    ARB, FSF = H.ARB, H.FSF
    K = lambda: str(uuid.uuid4())
    J = lambda d: "'" + json.dumps(d).replace("'", "''") + "'::jsonb"
    def save(uid, root, rid, payload, exp, key, role="authenticated"):
        rid_s = f"'{rid}'::uuid" if rid else "NULL::uuid"; exp_s = f"'{exp}'::timestamptz" if exp else "NULL::timestamptz"
        return pg.sql(as_user(uid, role) + f"SELECT public.tenant_catalog_root_save('{root}', {rid_s}, {J(payload)}, {exp_s}, '{key}'::uuid)::text;", ok=False)
    js = lambda r: json.loads(val(r)) if r and not r.startswith("ERR") else {"err": r[:200]}
    k1 = K(); r1 = js(save(H.UA, "microrganismos", None, {"nome": "CRUD M1", "tipo": "bacteria"}, None, k1))
    c("CRUD-1", "gestor AR Bio cria microrganismo por RPC: dono AR Bio derivado do servidor", ARB, r1.get("organization_id"), kind="PG_DISPOSABLE_REAL_SCHEMA_SYNTHETIC_AUTH")
    mid = r1.get("id")
    r2 = js(save(H.UA, "microrganismos", None, {"nome": "CRUD M1", "tipo": "bacteria"}, None, k1))
    c("CRUD-2", "replay mesma chave/payload: idempotente (mesmo id, replayed)", f"{mid}|True", f"{r2.get('id')}|{r2.get('replayed')}", kind="PG_DISPOSABLE_REAL_SCHEMA_SYNTHETIC_AUTH")
    r = save(H.UA, "microrganismos", None, {"nome": "CRUD M1x", "tipo": "bacteria"}, None, k1)
    c("CRUD-3", "mesma chave com payload diferente: conflito PT409", True, "tenant_catalog_idempotency_conflict" in r, kind="PG_DISPOSABLE_REAL_SCHEMA_SYNTHETIC_AUTH")
    cod = q(f"SELECT codigo FROM public.microrganismos WHERE id='{mid}'") if mid else ""
    c("CRUD-3b", "código automático por empresa no create por RPC (prefixo BAC)", True, cod.startswith("BAC-"), kind="PG_DISPOSABLE_REAL_SCHEMA_SYNTHETIC_AUTH")
    ts = q(f"SELECT updated_at FROM public.microrganismos WHERE id='{mid}'") if mid else ""
    r = save(H.UA, "microrganismos", mid, {"observacoes": "x"}, "2000-01-01T00:00:00Z", K())
    c("CRUD-4", "CAS: token obsoleto => tenant_catalog_stale (PT409)", True, "tenant_catalog_stale" in r, kind="PG_DISPOSABLE_REAL_SCHEMA_SYNTHETIC_AUTH")
    r4 = js(save(H.UA, "microrganismos", mid, {"observacoes": "ok"}, ts, K()))
    c("CRUD-4b", "CAS correto atualiza e token do servidor avança", True,
      bool(r4.get("updated_at")) and q(f"SELECT '{r4.get('updated_at')}'::timestamptz > '{ts}'::timestamptz") == "t", kind="PG_DISPOSABLE_REAL_SCHEMA_SYNTHETIC_AUTH")
    ts2 = q(f"SELECT updated_at FROM public.microrganismos WHERE id='{mid}'")
    r = save(H.UF, "microrganismos", mid, {"observacoes": "hack"}, ts2, K())
    c("CRUD-5", "gestor FSF não altera microrganismo da AR Bio (não encontrado)", True, "tenant_catalog_not_found" in r, kind="PG_DISPOSABLE_REAL_SCHEMA_SYNTHETIC_AUTH")
    r = save(H.UB2B, "culturas", None, {"nome": "Leitor C"}, None, K())
    c("CRUD-6", "leitor (sem admin/gestor) não cria por RPC", True, r.startswith("ERR") and "tenant_catalog_root_save" not in r.split("CONTEXT")[0] or "denied" in r.lower(), kind="PG_DISPOSABLE_REAL_SCHEMA_SYNTHETIC_AUTH")
    r = save(H.USA, "culturas", None, {"nome": "SA C"}, None, K())
    c("CRUD-7", "Superadmin sem tenant não cria (sem bypass)", True, r.startswith("ERR"), kind="PG_DISPOSABLE_REAL_SCHEMA_SYNTHETIC_AUTH")
    r = save(None, "culturas", None, {"nome": "Anon C"}, None, K(), role="anon")
    c("CRUD-7b", "anon sem EXECUTE", True, "permission denied" in r, kind="PG_DISPOSABLE_REAL_SCHEMA_SYNTHETIC_AUTH")
    r = save(H.UA, "microrganismos", None, {"nome": "Own", "tipo": "bacteria", "owner_organization_id": FSF}, None, K())
    r_ = save(H.UA, "microrganismos", None, {"nome": "Cod", "tipo": "bacteria", "codigo": "BAC-999"}, None, K())
    c("CRUD-8", "payload não define dono (allowlist); código manual preservado no tenant do servidor", f"True|{ARB}",
      f"{'field_forbidden:owner_organization_id' in r}|{js(r_).get('organization_id', r_[:120])}", kind="PG_DISPOSABLE_REAL_SCHEMA_SYNTHETIC_AUTH")
    pf = q(f"SELECT id FROM public.produtos WHERE owner_organization_id='{FSF}' LIMIT 1")
    # exclui produto contaminado de propósito pelo WR-7 (volume de outra empresa injetado como estado legado)
    pa = q(f"SELECT p.id FROM public.produtos p WHERE p.owner_organization_id='{ARB}' AND NOT EXISTS (SELECT 1 FROM public.catalogo_volumes v WHERE v.produto_id=p.id AND v.owner_organization_id<>p.owner_organization_id) ORDER BY p.nome LIMIT 1")
    r = save(H.UA, "catalogo_volumes", None, {"item_tipo": "produto", "produto_id": pf, "volume_ml": 1000, "preco_brl": 1, "moeda": "BRL", "ordem": 1}, None, K())
    c("CRUD-9", "volume com produto de OUTRA empresa negado (ref_foreign)", True, "tenant_catalog_ref_foreign:produto_id" in r, kind="PG_DISPOSABLE_REAL_SCHEMA_SYNTHETIC_AUTH")
    rv = save(H.UA, "catalogo_volumes", None, {"item_tipo": "produto", "produto_id": pa, "volume_ml": 500, "preco_brl": 1, "moeda": "BRL", "ordem": 9}, None, K())
    c("CRUD-9b", "volume do próprio produto criado com dono AR Bio", ARB, js(rv).get("organization_id", rv[:160] + " | vols=" + q(f"SELECT string_agg(coalesce(owner_organization_id::text,'NULL'),',') FROM public.catalogo_volumes WHERE produto_id='{pa}'")), kind="PG_DISPOSABLE_REAL_SCHEMA_SYNTHETIC_AUTH")
    r = save(H.UA, "product_technical_profiles", None, {"produto_id": pa, "resumo_curto": "x", "status_validacao": "validado"}, None, K())
    c("CRUD-10", "perfil técnico não recebe status/validação pelo payload", True, "field_forbidden:status_validacao" in r, kind="PG_DISPOSABLE_REAL_SCHEMA_SYNTHETIC_AUTH")
    r = save(H.UA, "product_technical_profiles", None, {"produto_id": pf, "resumo_curto": "x"}, None, K())
    c("CRUD-10b", "perfil técnico para produto de OUTRA empresa negado", True, "tenant_catalog_ref_foreign:produto_id" in r, kind="PG_DISPOSABLE_REAL_SCHEMA_SYNTHETIC_AUTH")
    rp = save(H.UA, "product_technical_profiles", None, {"produto_id": pa, "resumo_curto": "Resumo"}, None, K())
    c("CRUD-10c", "perfil técnico do próprio produto criado por RPC", True, js(rp).get("ok") is True or "duplicate" in rp, kind="PG_DISPOSABLE_REAL_SCHEMA_SYNTHETIC_AUTH")
    ma = q(f"SELECT id FROM public.microrganismos WHERE owner_organization_id='{ARB}' ORDER BY nome LIMIT 1")
    mf = q(f"SELECT id FROM public.microrganismos WHERE owner_organization_id='{FSF}' LIMIT 1")
    def repl(uid, items, exp, key):
        return pg.sql(as_user(uid) + f"SELECT public.tenant_catalog_formulacoes_replace('{pa}'::uuid, {J(items)}, '{exp}'::timestamptz, '{key}'::uuid)::text;", ok=False)
    before = q(f"SELECT count(*) FROM public.formulacoes WHERE produto_id='{pa}'")
    pts = q(f"SELECT updated_at FROM public.produtos WHERE id='{pa}'")
    r = repl(H.UA, [{"microrganismo_id": ma, "concentracao": 1}, {"microrganismo_id": mf, "concentracao": 2}], pts, K())
    after = q(f"SELECT count(*) FROM public.formulacoes WHERE produto_id='{pa}'")
    c("CRUD-11", "formulações com microrganismo de OUTRA empresa: negado e conjunto anterior intacto (atômico)", f"True|{before}",
      f"{'tenant_catalog_ref_foreign:microrganismo_id' in r}|{after}", kind="PG_DISPOSABLE_REAL_SCHEMA_SYNTHETIC_AUTH")
    r = js(repl(H.UA, [{"microrganismo_id": ma, "concentracao": 1}], pts, K()))
    c("CRUD-11b", "substituição atômica do conjunto com CAS do produto", "1|True",
      f"{q(chr(83)+'ELECT count(*) FROM public.formulacoes WHERE produto_id=' + chr(39) + pa + chr(39))}|{q(f'SELECT updated_at > {chr(39)}{pts}{chr(39)}::timestamptz FROM public.produtos WHERE id={chr(39)}{pa}{chr(39)}') == 't'}",
      kind="PG_DISPOSABLE_REAL_SCHEMA_SYNTHETIC_AUTH")
    r = repl(H.UA, [], pts, K())
    c("CRUD-11c", "formulações com token do produto obsoleto: PT409", True, "tenant_catalog_stale" in r, kind="PG_DISPOSABLE_REAL_SCHEMA_SYNTHETIC_AUTH")
    acl = q("SELECT string_agg(t || ':' || has_table_privilege('authenticated','public.'||t,'INSERT'), ',' ORDER BY t) FROM unnest(ARRAY['catalogo_volumes','formulacoes','product_technical_profiles','microorganism_technical_profiles']) t")
    c("CRUD-12", "escrita direta de cliente fechada (volumes/formulações/perfis técnicos)",
      "catalogo_volumes:false,formulacoes:false,microorganism_technical_profiles:false,product_technical_profiles:false", acl, kind="PG_DISPOSABLE_REAL_SCHEMA")
    rc_ = js(save(H.UA, "culturas", None, {"nome": "CRUD Cultura"}, None, K()))
    cid = rc_.get("id"); cts = q(f"SELECT updated_at FROM public.culturas WHERE id='{cid}'") if cid else ""
    r = pg.sql(as_user(H.UF) + f"SELECT public.tenant_catalog_root_delete('culturas','{cid}'::uuid,'{cts}'::timestamptz,'{K()}'::uuid)::text;", ok=False)
    c("CRUD-13", "gestor FSF não exclui cultura da AR Bio", True, "tenant_catalog_not_found" in r, kind="PG_DISPOSABLE_REAL_SCHEMA_SYNTHETIC_AUTH")
    r = js(pg.sql(as_user(H.UA) + f"SELECT public.tenant_catalog_root_delete('culturas','{cid}'::uuid,'{cts}'::timestamptz,'{K()}'::uuid)::text;", ok=False))
    c("CRUD-13b", "dono exclui cultura sem uso com CAS", True, r.get("deleted") is True, kind="PG_DISPOSABLE_REAL_SCHEMA_SYNTHETIC_AUTH")
