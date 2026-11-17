#!/usr/bin/env python3
"""Gera o pacote HML (vrlcdwmlytukrjezrrnf) a partir do candidato de produção.
Única diferença no SQL: o bloco PRE rev.5 ($pre5$) — impressão digital HML, pins comprovados pelo alinhamento
homolog-alignment-20261102/01 (APLICADO em HML 03/11) e variante do gatilho de principal entre as TESTADAS.
Lógica de negócio byte-idêntica (verificado: o restante do arquivo é igual ao candidato). Nunca editar à mão."""
import hashlib, json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__)); PKG = os.path.dirname(HERE)
src = open(os.path.join(PKG, "candidate.sql.review")).read()
m = list(re.finditer(r"DO \$pre5\$ BEGIN\n.*?END \$pre5\$;\n", src, re.S)); assert len(m) == 1, "âncora $pre5$ deve existir exatamente 1x"
cap = open(os.path.join(PKG, "captured-prod-user-triggers-20261117.sql")).read()
trg = re.findall(r"^(CREATE TRIGGER (\S+) .*? ON public\.(\w+) .*?);$", cap, re.M)
assert len(trg) == 28, len(trg)
SYNC_STMT = {"trg_user_clientes_sync_ins", "trg_user_clientes_sync_upd", "trg_user_clientes_sync_del"}
guards = [(t, n, d) for d, n, t in trg if n not in SYNC_STMT]; stmt = [(t, n, d) for d, n, t in trg if n in SYNC_STMT]
assert len(guards) == 25 and len(stmt) == 3
LEGACY = ("user_clientes", "trg_user_clientes_sync", "CREATE TRIGGER trg_user_clientes_sync AFTER INSERT OR DELETE OR UPDATE ON public.user_clientes FOR EACH ROW EXECUTE FUNCTION sync_user_cliente_principal()")
q = lambda s: "'" + s.replace("'", "''") + "'"
vals = lambda rows: ",\n    ".join(f"({q(t)},{q(n)},{q(d)})" for t, n, d in rows)
HML_ORGS = ("c809e74f-486b-44b2-b2f4-4088f53421bb", "dcf50a75-579a-4828-a0fc-1d8eadcb4b8a")
PROD_ORGS = ("8eae2bc1-ad00-4402-9f57-564258e493ca", "442444d9-263f-45d9-a991-a679498d06c3", "4e537fd6-4632-4c70-a782-386dba3e8f9f", "8f57c7dd-0557-4041-b401-7a00f7244626", "007bb519-cba0-4704-be2c-cb93ad010048")
PINS = [("public.guard_profile_tenant_fields()", "bd6d513d936f5c5fb0490b5d1d2f9f1d"), ("public.enforce_cliente_id_for_produtor()", "ecad56badcb2120f7048fad7519f76f4"),
        ("cf_user_guards_v1.acquire_gate()", "b0dd9a14d5fd799a40df0975baf4c5a6"), ("public.is_platform_superadmin(uuid)", "3dfe79d976821244d9b7a7f893d765f2"),
        ("platform_private.has_role(uuid,app_role)", "c5af5b55de6d79da9b73a33948746ae2"), ("platform_private.h15_actor_organization()", "64e10608403238a41a9baf92857ca881")]
VARIANTS = {"1d053564ccd5fa672a10ec87d5cb0baa": "statement (produção, scripts/user-links-principal)", "50392a57c5908c67c709c4e84f0e932e": "row legado (migração 20260519155317)"}
SKIP_PINS = set(os.environ.get("HML_HARNESS_SKIP_PINS", "").split(",")) - {""}   # SÓ o teste local pode pular pins de costuras sintéticas

def checks(mode):  # mode 'raise' (PRE instalável) ou 'probe' (somente leitura, devolve linhas)
    pins = [(f, h) for f, h in PINS if f not in SKIP_PINS]
    body = f"""DECLARE v_fail text[] := ARRAY[]::text[]; v_sync text; r record;
BEGIN
  -- 1) impressão digital (mesma de homolog-alignment-20261102/00): só a homologação
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = {q(HML_ORGS[0])}) OR NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = {q(HML_ORGS[1])}) THEN v_fail := v_fail || 'not_homolog:homolog_orgs_absent'::text; END IF;
  IF EXISTS (SELECT 1 FROM public.organizations WHERE id IN ({",".join(q(x) for x in PROD_ORGS)})) THEN v_fail := v_fail || 'not_homolog:production_org_present'::text; END IF;
  -- 2) pins comprovados pelo POST do alinhamento 01 (aplicado em HML), iguais aos de produção
  FOR r IN SELECT * FROM (VALUES {", ".join(f"({q(f)},{q(h)})" for f, h in pins)}) v(f, h) LOOP
    IF to_regprocedure(r.f) IS NULL THEN v_fail := v_fail || ('missing_function:' || r.f);
    ELSIF md5(pg_get_functiondef(to_regprocedure(r.f))) <> r.h THEN v_fail := v_fail || ('function_drift:' || r.f || ':' || md5(pg_get_functiondef(to_regprocedure(r.f)))); END IF;
  END LOOP;
  -- 3) os 25 gatilhos de guarda de produção: mesmos nome/tabela/definição e HABILITADOS (nenhum desativado)
  FOR r IN SELECT * FROM (VALUES
    {vals(guards)}) v(t, n, d) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = ('public.' || r.t)::regclass AND tgname = r.n AND NOT tgisinternal) THEN v_fail := v_fail || ('missing_guard_trigger:' || r.t || '.' || r.n);
    ELSIF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = ('public.' || r.t)::regclass AND tgname = r.n AND tgenabled = 'O' AND pg_get_triggerdef(oid) = r.d) THEN v_fail := v_fail || ('guard_trigger_drift_or_disabled:' || r.t || '.' || r.n); END IF;
  END LOOP;
  -- 4) gatilho de principal: só variantes testadas, com a topologia correspondente
  v_sync := md5(pg_get_functiondef('public.sync_user_cliente_principal()'::regprocedure));
  IF v_sync = '1d053564ccd5fa672a10ec87d5cb0baa' THEN
    FOR r IN SELECT * FROM (VALUES {vals(stmt)}) v(t, n, d) LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.user_clientes'::regclass AND tgname = r.n AND tgenabled = 'O' AND pg_get_triggerdef(oid) = r.d) THEN v_fail := v_fail || ('sync_topology:' || r.n); END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.user_clientes'::regclass AND tgname = 'trg_user_clientes_sync') THEN v_fail := v_fail || 'sync_topology:mixed'::text; END IF;
  ELSIF v_sync = '50392a57c5908c67c709c4e84f0e932e' THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.user_clientes'::regclass AND tgname = {q(LEGACY[1])} AND tgenabled = 'O' AND pg_get_triggerdef(oid) = {q(LEGACY[2])})
       OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.user_clientes'::regclass AND tgname LIKE 'trg_user_clientes_sync\\_%') THEN v_fail := v_fail || 'sync_topology:legacy_row'::text; END IF;
  ELSE v_fail := v_fail || ('sync_variant_untested:' || v_sync);
  END IF;
  -- 5) nenhum gatilho não testado nas 4 tabelas de usuário
  FOR r IN SELECT c.relname, t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
            WHERE NOT t.tgisinternal AND c.oid IN ('public.profiles'::regclass,'public.user_roles'::regclass,'public.user_clientes'::regclass,'public.partner_users'::regclass)
              AND (c.relname, t.tgname) NOT IN (SELECT * FROM (VALUES {", ".join(f"({q(t)},{q(n)})" for t, n, _ in guards + stmt + [LEGACY])}) x(a, b)) LOOP
    v_fail := v_fail || ('untested_extra_trigger:' || r.relname || '.' || r.tgname);
  END LOOP;
"""
    if mode == "raise":
        return "DO $pre5$\n" + body + "  IF cardinality(v_fail) > 0 THEN RAISE EXCEPTION 'PRE HML drift: %', array_to_string(v_fail, ', '); END IF;\n  RAISE NOTICE 'PRE HML ok: sync=%', v_sync;\nEND $pre5$;\n"
    return ("DO $probe$\n" + body +
            "  RAISE NOTICE 'PROBE sync_md5=%', v_sync;\n  FOR r IN SELECT unnest(v_fail) AS i LOOP RAISE NOTICE 'PROBE %', r.i; END LOOP;\n"
            "  IF cardinality(v_fail) = 0 THEN RAISE NOTICE 'PROBE PRE_WOULD_PASS'; END IF;\nEND $probe$;\n")

hdr = ("-- =====================================================================\n-- PACOTE HML — EXCLUSIVO vrlcdwmlytukrjezrrnf. GERADO por hml/build_hml.py a partir de candidate.sql.review.\n"
       "-- Difere do candidato de produção SOMENTE no bloco PRE $pre5$. NÃO executar em produção (a impressão digital aborta).\n"
       "-- =====================================================================\n")
pre = checks("raise")
out = hdr + src[:m[0].start()] + pre + src[m[0].end():]
# prova de equivalência: removendo o cabeçalho e o bloco PRE, o resto é idêntico
assert out[len(hdr):].replace(pre, "", 1) == src.replace(m[0].group(0), "", 1)
name = "candidate-hml.sql.review" if not SKIP_PINS else "candidate-hml.harness.sql"
dest = os.path.join(HERE, name) if not SKIP_PINS else os.path.join("/tmp", name)
open(dest, "w").write(out)
if not SKIP_PINS:
    open(os.path.join(HERE, "00-hml-user-topology-probe.sql"), "w").write(
        "-- SONDA SOMENTE LEITURA — rodar em vrlcdwmlytukrjezrrnf ANTES do candidato. Lista exatamente as garantias faltantes.\n"
        "BEGIN TRANSACTION READ ONLY;\n" + checks("probe") + "ROLLBACK;\n")
    rb = open(os.path.join(PKG, "rollback.sql.review")).read()
    open(os.path.join(HERE, "rollback-hml.sql.review"), "w").write("-- Rollback HML: idêntico ao de produção (deny-only, sem dependência de topologia).\n" + rb)
    for fn in ("tenant-user-admin", "user-email-change-sync"):
        s = open(os.path.join(PKG, "edge", fn, "index.ts.review")).read()
        assert s.count('const EXPECTED_URL = "https://swzpzcwiasxmjutrmvkm.supabase.co";') == 1
        os.makedirs(os.path.join(HERE, "edge", fn), exist_ok=True)
        open(os.path.join(HERE, "edge", fn, "index.ts.review"), "w").write(s.replace("swzpzcwiasxmjutrmvkm", "vrlcdwmlytukrjezrrnf"))
    sums = {}
    for root, _, fs in os.walk(HERE):
        for f in sorted(fs):
            if f.endswith((".review", ".sql")):
                pth = os.path.join(root, f); sums[os.path.relpath(pth, PKG)] = hashlib.sha256(open(pth, "rb").read()).hexdigest()
    json.dump({"source_candidate_sha256": hashlib.sha256(src.encode()).hexdigest(), "files": sums, "accepted_sync_variants": VARIANTS}, open(os.path.join(HERE, "MANIFEST.json"), "w"), indent=1, ensure_ascii=False)
print("ok", dest)
