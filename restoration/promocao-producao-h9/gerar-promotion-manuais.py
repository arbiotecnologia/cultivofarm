#!/usr/bin/env python3
"""P0c — gera os artefatos derivados de promoção que exigiam reescrita manual.

Determinístico e reexecutável. NUNCA altera arquivos de supabase/migrations/.
Não acessa banco algum.

Alvos:
  20260903182144  hardening H7L (security_invoker + ACL + search_path)
  20261023000000  H9-E2 (3 RPCs de visita, authz + idempotência concorrente)

Transformação: substitui SOMENTE o bloco de guarda de homologação pela guarda
canônica de promoção (GUC promocao.target_ref validado externamente pelo runner)
somada a prechecks fail-closed determinísticos; remove dependências inválidas de
promoção (ledger fixo, OID fixo, marcador de homologação). O trabalho real é
preservado byte a byte e isso é verificado por asserção.
"""
import csv, hashlib, os, re, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
P = os.path.join(ROOT, "restoration/promocao-producao-h9")
OUT = os.path.join(P, "promotion-sql")
PROD = "navfzbwgwzruipouyfnk"
STG = "ikaauvsflpmamgxmkhoq"

GUARD = f"""DO $promo_guard$
BEGIN
  IF coalesce(current_setting('promocao.target_ref', true), '') <> '{PROD}' THEN
    RAISE EXCEPTION 'PROMO_GUARD: alvo nao confirmado (esperado %)', '{PROD}'
      USING ERRCODE = '42501';
  END IF;
END
$promo_guard$;
"""

SIGS = {
    "finish_technical_visit_secure":
        "public.finish_technical_visit_secure(uuid,numeric,numeric,numeric,text,text,text,uuid)",
    "rpc_realizar_checkin_visita":
        "public.rpc_realizar_checkin_visita(uuid,uuid,public.tipo_checkin,numeric,numeric,numeric,"
        "text,text,timestamptz,uuid,uuid,uuid,uuid,text)",
    "rpc_realizar_checkout_visita":
        "public.rpc_realizar_checkout_visita(uuid,uuid,numeric,numeric,numeric,text,text,timestamptz,text)",
}
OIDS = {"24597": "finish_technical_visit_secure",
        "24798": "rpc_realizar_checkin_visita",
        "24800": "rpc_realizar_checkout_visita"}


def header(orig, oh, tr):
    return (
        "-- ============================================================================\n"
        "-- ARTEFATO DERIVADO DE PROMOÇÃO — NÃO É MIGRATION HISTÓRICA, NÃO EDITE\n"
        f"-- Origem      : {orig}\n"
        f"-- SHA-256 orig: {oh}\n"
        "-- Gerador     : restoration/promocao-producao-h9/gerar-promotion-manuais.py\n"
        f"-- Transformação: {tr}\n"
        "--\n"
        "-- O runner valida o ref do alvo por canal externo (API/DSN) e só então executa\n"
        f"-- `SET LOCAL promocao.target_ref = '{PROD}'`. Nenhuma tabela marcadora de\n"
        "-- homologação é consultada, nenhum OID e nenhuma contagem de ledger é fixada.\n"
        "-- ============================================================================\n"
    )


# --------------------------------------------------------------- 20260903182144
def build_h7l():
    src = "supabase/migrations/20260903182144_h7l_security_advisor_hardening.sql"
    raw = open(os.path.join(ROOT, src), encoding="utf-8").read()
    oh = hashlib.sha256(raw.encode()).hexdigest()

    marca = "end $$;"
    i = raw.index(marca) + len(marca)
    guarda_original, trabalho = raw[:i], raw[i:]
    assert STG in guarda_original, "guarda de homologação não localizada"
    assert STG not in trabalho, "ref de homologação fora do bloco de guarda"
    assert trabalho.count("set (security_invoker = true)") == 3
    assert trabalho.count("alter function ") == 22

    pre = GUARD + """
-- Precheck fail-closed: as 3 views alvo e as 3 tabelas base precisam existir,
-- e as tabelas base precisam estar com RLS habilitada. Sem isso, security_invoker
-- nas views trocaria proteção por exposição.
DO $h7l_pre$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(x.relname, ', ') INTO v_missing
  FROM (values
    ('v_fiscal_nfe_emitter_readiness'),
    ('v_fiscal_nfe_recipient_readiness'),
    ('v_fiscal_nfe_rule_coverage')
  ) x(relname)
  WHERE to_regclass('public.' || x.relname) IS NULL;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'H7L_PROMO: views ausentes: %', v_missing;
  END IF;

  SELECT string_agg(x.relname, ', ') INTO v_missing
  FROM (values
    ('company_fiscal_settings'),
    ('customer_fiscal_profiles'),
    ('fiscal_tax_rules')
  ) x(relname)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = x.relname AND c.relrowsecurity
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'H7L_PROMO: tabela base sem RLS habilitada: %', v_missing;
  END IF;
END
$h7l_pre$;"""

    pos = """

-- Pós-check fail-closed: security_invoker efetivo nas 3 views, sem grant a
-- PUBLIC/anon, e search_path fixo nas 22 funções tocadas.
DO $h7l_pos$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO v_bad
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('v_fiscal_nfe_emitter_readiness',
                      'v_fiscal_nfe_recipient_readiness',
                      'v_fiscal_nfe_rule_coverage')
    AND NOT COALESCE(c.reloptions::text LIKE '%security_invoker=true%', false);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'H7L_PROMO: security_invoker ausente em: %', v_bad;
  END IF;

  SELECT string_agg(c.relname, ', ') INTO v_bad
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('v_fiscal_nfe_emitter_readiness',
                      'v_fiscal_nfe_recipient_readiness',
                      'v_fiscal_nfe_rule_coverage')
    AND (array_to_string(c.relacl, ',') ~ '(^|,)=' OR array_to_string(c.relacl, ',') LIKE '%anon=%');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'H7L_PROMO: view exposta a PUBLIC/anon: %', v_bad;
  END IF;
END
$h7l_pos$;
"""
    tr = ("guarda de homologação por marcador substituída pela guarda canônica de "
          "promoção + precheck de existência e RLS; pós-check de security_invoker e ACL; "
          "trabalho real preservado byte a byte")
    return src, oh, header(src, oh, tr) + pre + trabalho + pos, tr


# --------------------------------------------------------------- 20261023000000
def build_h9e2():
    src = ("restoration/homologacao-h9/h9e-forwards/"
           "20261023000000_h9e2_visit_rpcs_authz_and_concurrent_idempotency_v1.sql")
    raw = open(os.path.join(ROOT, src), encoding="utf-8").read()
    oh = hashlib.sha256(raw.encode()).hexdigest()

    ini = raw.index("DO $guard_pre$")
    fim = raw.index("$guard_pre$;", ini) + len("$guard_pre$;")
    corpo = raw[fim:]
    assert STG not in corpo, "ref de homologação fora do guard_pre"
    assert corpo.count("CREATE OR REPLACE FUNCTION") == 3

    # OID fixo -> assinatura canônica (regprocedure)
    for oid, proname in OIDS.items():
        alvo = f"p.oid = {oid}::oid"
        assert alvo in corpo, f"OID {oid} não localizado"
        corpo = corpo.replace(alvo, f"p.oid = '{SIGS[proname]}'::regprocedure")
    assert not re.search(r"\d{4,5}::oid", corpo), "OID literal remanescente"

    pre = GUARD + """
-- ---------------------------------------------------------------------------
-- PRECHECK FAIL-CLOSED (baseline semântico; sem ledger fixo e sem OID).
-- Em produção o corpo destas funções resulta das ondas anteriores desta mesma
-- promoção, e não do corpo medido em homologação; por isso o baseline é
-- semântico e verificável, nunca um md5(prosrc) importado de outro ambiente.
-- ---------------------------------------------------------------------------
DO $h9e2_pre$
DECLARE
  v_sig  text;
  v_oid  oid;
  v_rec  record;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.finish_technical_visit_secure(uuid,numeric,numeric,numeric,text,text,text,uuid)',
    'public.rpc_realizar_checkin_visita(uuid,uuid,public.tipo_checkin,numeric,numeric,numeric,text,text,timestamptz,uuid,uuid,uuid,uuid,text)',
    'public.rpc_realizar_checkout_visita(uuid,uuid,numeric,numeric,numeric,text,text,timestamptz,text)'
  ] LOOP
    v_oid := to_regprocedure(v_sig);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'H9E2_PROMO: assinatura ausente: %', v_sig;
    END IF;
    SELECT p.prosecdef, pg_get_userbyid(p.proowner) AS owner, p.proconfig
      INTO v_rec FROM pg_proc p WHERE p.oid = v_oid;
    IF NOT v_rec.prosecdef THEN
      RAISE EXCEPTION 'H9E2_PROMO: % sem SECURITY DEFINER no baseline', v_sig;
    END IF;
    IF v_rec.owner <> 'postgres' THEN
      RAISE EXCEPTION 'H9E2_PROMO: % com owner inesperado (%)', v_sig, v_rec.owner;
    END IF;
    IF NOT (v_rec.proconfig @> ARRAY['search_path=public']) THEN
      RAISE EXCEPTION 'H9E2_PROMO: % sem search_path=public fixo', v_sig;
    END IF;
  END LOOP;

  -- Dependências do tratamento de corrida.
  IF to_regprocedure('public._visita_scope_ok(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'H9E2_PROMO: helper _visita_scope_ok(uuid,uuid) ausente';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'visitas_checkin'
       AND indexname = 'visitas_checkin_client_uuid_uq'
  ) THEN
    RAISE EXCEPTION 'H9E2_PROMO: indice unico visitas_checkin_client_uuid_uq ausente';
  END IF;

  -- Idempotência da própria promoção: se o corpo já contém a ordem canônica,
  -- a reaplicação é inofensiva (CREATE OR REPLACE), mas fica registrada.
  RAISE NOTICE 'H9E2_PROMO: baseline semantico validado.';
END
$h9e2_pre$;"""

    tr = ("guard_pre de homologação (marcador, ledger=678, OIDs e md5 de prosrc de "
          "homologação) substituído por guarda canônica de promoção + baseline semântico "
          "por regprocedure/SECDEF/owner/search_path + precheck do índice único; "
          "OIDs fixos do pós-check trocados por assinatura ::regprocedure; "
          "3 CREATE OR REPLACE, ACL, SECURITY DEFINER e pós-checks preservados")
    return src, oh, header(src, oh, tr) + pre + corpo, tr


def main():
    os.makedirs(OUT, exist_ok=True)
    gerados = {}
    for version, build in (("20260903182144", build_h7l), ("20261023000000", build_h9e2)):
        src, oh, texto, tr = build()
        # higiene obrigatória do artefato
        exe = "\n".join(l for l in texto.splitlines() if not l.strip().startswith("--"))
        for proibido in (STG, "yzszlzjpovmcteuxjznj", "_fiscal_staging_marker",
                         "fiscal_environment_marker"):
            assert proibido not in exe, f"{version}: '{proibido}' em código executável"
        assert not re.search(r"\d{4,5}::oid", exe), f"{version}: OID literal"
        nome = f"{version}__promocao.sql"
        open(os.path.join(OUT, nome), "w", encoding="utf-8").write(texto)
        gerados[version] = dict(
            origem=src, sha256_origem=oh,
            artefato=f"restoration/promocao-producao-h9/promotion-sql/{nome}",
            sha256_artefato=hashlib.sha256(texto.encode()).hexdigest(),
            transformacao=tr)

    # ---- cron (artefato escrito à mão, hash calculado aqui)
    cron_src = "supabase/migrations/20261003000000_h8e_fix_prune_audit_logs_performed_at_v1.sql"
    cron_art = "restoration/promocao-producao-h9/promotion-sql/20261003000000__promocao_cron.sql"
    cron_txt = open(os.path.join(ROOT, cron_art), encoding="utf-8").read()

    # ---- atualização do manifesto de artefatos
    path = os.path.join(P, "10-manifesto-artefatos-promocao.csv")
    rows = list(csv.DictReader(open(path, encoding="utf-8")))
    cols = list(rows[0].keys())
    by = {r["version"]: r for r in rows}

    for v, g in gerados.items():
        r = by[v]
        r.update(classe="PROMOVIVEL_COM_ARTEFATO", artefato=g["artefato"],
                 sha256_artefato=g["sha256_artefato"], transformacao=g["transformacao"],
                 pendencia="—", guardas_removidas="1")

    # 20260729004013: rollback drill, sem capacidade de negócio
    r = by["20260729004013"]
    r.update(classe="STAGING_ONLY", artefato="—", sha256_artefato="—",
             transformacao="—", guardas_removidas="0",
             pendencia="drill de rollback: altera comentario e restaura a definicao na "
                       "mesma migration; nao entrega capacidade de negocio; NAO PROMOVER")

    if "20261003000000" not in by:
        novo = {c: "" for c in cols}
        novo.update(version="20261003000000", origem=cron_src,
                    sha256_origem=hashlib.sha256(
                        open(os.path.join(ROOT, cron_src), encoding="utf-8").read().encode()).hexdigest(),
                    artefato=cron_art,
                    sha256_artefato=hashlib.sha256(cron_txt.encode()).hexdigest(),
                    transformacao="baseline de homologacao substituido pelo baseline real de "
                                  "producao (md5 e14782b8984dd461684fdbdc2c4008ff); rollback real "
                                  "por captura do command em promocao_rollback_baseline",
                    guardas_removidas="0", classe="PROMOVIVEL_COM_ARTEFATO",
                    pendencia="—", onda="P2", dominio="observabilidade")
        rows.append(novo)
    else:
        by["20261003000000"].update(
            artefato=cron_art,
            sha256_artefato=hashlib.sha256(cron_txt.encode()).hexdigest(),
            classe="PROMOVIVEL_COM_ARTEFATO", pendencia="—")

    rows.sort(key=lambda r: r["version"])
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)

    from collections import Counter
    print("manifesto de artefatos:", Counter(r["classe"] for r in rows))
    return 0


if __name__ == "__main__":
    sys.exit(main())
