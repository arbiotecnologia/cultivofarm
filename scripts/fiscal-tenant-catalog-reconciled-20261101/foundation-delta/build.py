#!/usr/bin/env python3
"""Reconciliação 09/10/13 da fundação ownership sobre definições LIVE capturadas (READ ONLY).

NO_GO. Gera apenas arquivos *.sql.review. Não conecta a nenhum banco.
Delta mínimo = definição LIVE atual + filtro ownership global-only do candidato original.
Nunca reverte guards/CAS/isolamento atuais; nunca troca só o hash esperado.
Substituições ancoradas: cada âncora deve ocorrer exatamente N vezes, senão aborta.
"""
import hashlib, json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parents[3]
HERE = pathlib.Path(__file__).resolve().parent
EVID = ROOT / "docs/auditorias/evidencias/reconciliacao-fiscal-catalogo-20261101/foundation-live-pins-20261101"
RBAC = ROOT / "scripts/rbac-audit"
LIVE = json.loads((EVID / "live_foundation_pins.json").read_text())
MANIFEST = json.loads((RBAC / "ownership-ordered-manifest.json").read_text())

ORIG_EXPECTED = {"09": "e3b94ad47b93b02c9717a6a694163552", "10": "5e364c8f67c92fb31ff9568310eb876c",
                 "13": "806751acb0477165ed863320ab24c6d0"}
SIG = {"09": "public.rpc_cc_validate_matrix(uuid, text, uuid, uuid)",
       "10": "public.rpc_fiscal_draft_save(uuid, jsonb, jsonb, integer)",
       "13": "platform_private.catalog_tenant_set_visibility_core(text, uuid, boolean, integer, text, uuid)"}
FILES = {"09": "proposed-tenant-catalog-ownership-09-commercial-matrix.sql",
         "10": "proposed-tenant-catalog-ownership-10-global-roots.sql",
         "13": "proposed-tenant-catalog-ownership-13-visibility-target.sql"}

# Âncoras de hardening atual que DEVEM sobreviver no candidato reconciliado (prova pós-replace).
MUST_KEEP = {
    "09": ["platform_private.c2p1_assignment_allowed(p_buyer_scope,p_partner_id,p_customer_id)",
           "platform_private.c2p1_item_allowed(i.assignment_id", "platform_private.c2p1_item_allowed(assignment_id",
           "public.fn_cc_can_prepare(auth.uid())"],
    "10": ["PERFORM public.h15_require_staff();", "public.h15_require_invoice(p_invoice_id)",
           "draft_version IS DISTINCT FROM p_expected_version", "USING ERRCODE = 'PT409'",
           "AND draft_version = p_expected_version;", "AND public.h15_company_access(company_settings_id)"],
    "13": ["USING ERRCODE='PT409'", "pg_advisory_xact_lock(hashtextextended(concat_ws(':','ctvk'",
           "catalog_tenant_visibility_ledger", "platform_private.catalog_tenant_actor('mutate')"],
}
MUST_ADD = {"09": "owner_organization_id IS NULL", "10": "pr.owner_organization_id IS NULL",
            "13": "owner_organization_id IS NULL"}

# (âncora, substituição, ocorrências exatas)
DELTAS = {
    "09": [("     WHERE COALESCE(p.ativo,true)\n", "     WHERE p.owner_organization_id IS NULL AND COALESCE(p.ativo,true)\n", 1),
           ("     WHERE COALESCE(m.ativo,true)\n", "     WHERE m.owner_organization_id IS NULL AND COALESCE(m.ativo,true)\n", 1)],
    "10": [("SELECT 1 FROM public.produtos pr WHERE pr.id = v_source_id)",
            "SELECT 1 FROM public.produtos pr WHERE pr.id = v_source_id AND pr.owner_organization_id IS NULL)", 1)],
    "13": [("FROM public.produtos WHERE id=p_entity_id;", "FROM public.produtos WHERE id=p_entity_id AND owner_organization_id IS NULL;", 1),
           ("FROM public.microrganismos WHERE id=p_entity_id;", "FROM public.microrganismos WHERE id=p_entity_id AND owner_organization_id IS NULL;", 1),
           ("FROM public.culturas WHERE id=p_entity_id;", "FROM public.culturas WHERE id=p_entity_id AND owner_organization_id IS NULL;", 1)],
}


def md5(s): return hashlib.md5(s.encode()).hexdigest()
def sha(p): return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()


def live_def(k):
    f = next(x for x in LIVE["functions"] if x["signature"] == SIG[k])
    if md5(f["definition"]) != f["md5"]:
        sys.exit(f"captura {k} md5 divergente do próprio pin")
    return f["definition"], f["md5"]


def reconcile(k):
    body, pin = live_def(k)
    out = body
    for a, b, n in DELTAS[k]:
        c = out.count(a)
        if c != n:
            sys.exit(f"{k}: âncora {a!r} ocorre {c}x (esperado {n})")
        out = out.replace(a, b)
    for m in MUST_KEEP[k]:
        if m not in out:
            sys.exit(f"{k}: hardening atual perdido: {m}")
    return body, pin, out


def lit(s): return "'" + s.replace("'", "''") + "'"


def post_guard(k, tag):
    checks = "\n".join(f"  IF strpos(v_def, {lit(m)}) = 0 THEN RAISE EXCEPTION '{tag}_post_hardening_lost'; END IF;"
                       for m in MUST_KEEP[k] + [MUST_ADD[k]])
    return (f"DO $post$ DECLARE v_def text := pg_get_functiondef({lit(SIG[k])}::regprocedure); BEGIN\n{checks}\nEND $post$;\n")


def emit_file(k, live_body, pin, rec):
    src = (RBAC / FILES[k]).read_text()
    if ORIG_EXPECTED[k] not in src:
        sys.exit(f"{k}: hash original não encontrado no arquivo fonte")
    head = rec.rstrip("\n") + ";\n"
    if k == "10":
        i = src.index("CREATE OR REPLACE FUNCTION public.rpc_fiscal_draft_save")
        j = src.index("$function$;", src.index("AS $function$", i) + 13) + len("$function$;")
        new = src[:i] + head + post_guard(k, "ownership10r") + src[j + 1:]
    else:
        i = src.index("CREATE OR REPLACE FUNCTION")
        j = src.index("$function$;", src.index("AS $function$", i) + 13) + len("$function$;")
        new = src[:i] + head + post_guard(k, f"ownership{k}r") + src[j + 1:]
    assert new.count(ORIG_EXPECTED[k]) == 1
    new = new.replace(ORIG_EXPECTED[k], pin)
    banner = (f"-- RECONCILIADO {k}r (NO_GO, NÃO APLICAR). Fonte original preservada em scripts/rbac-audit/{FILES[k]}.\n"
              f"-- Pin original {ORIG_EXPECTED[k]} DIVERGE do live {pin} (captura READ ONLY 2026-11-01).\n"
              "-- Corpo = definição LIVE + filtro ownership global-only; guards/CAS/isolamento atuais preservados\n"
              "-- e reverificados após o REPLACE. Requer 00-pre-global aprovado na MESMA transação.\n")
    return banner + new


def pre_global():
    pins = []
    for c in LIVE["comparison"]:
        pins.append((c["signature"], c["actual"]))
    rows = ",\n".join(f"    ({lit(s)}, {lit(h)})" for s, h in pins)
    absent = ["platform_private.catalog_ownership_enabled()"]
    return f"""-- 00 PRE GLOBAL da fundação ownership — NO_GO, NÃO APLICAR.
-- Somente leitura: executa em transação READ ONLY; qualquer write falharia (25006).
-- Valida TODAS as dependências/pins ANTES da primeira DDL do arquivo 01. Se qualquer item
-- falhar, aborta sem nenhuma alteração. Pins = live READ ONLY 2026-11-01 ({LIVE['project_ref']}).
-- 17 pins: 14 iguais ao original, 3 reconciliados (09/10/13) com delta mínimo revisado.
BEGIN TRANSACTION READ ONLY;
DO $pre$
DECLARE r record; v_fail text[] := ARRAY[]::text[]; v_md5 text;
BEGIN
  IF current_setting('transaction_read_only') <> 'on' THEN RAISE EXCEPTION 'pre_global_must_be_read_only'; END IF;
  FOR r IN SELECT * FROM (VALUES
{rows}
  ) AS t(sig, pin) LOOP
    IF to_regprocedure(r.sig) IS NULL THEN v_fail := v_fail || ('missing:' || r.sig);
    ELSE
      v_md5 := md5(pg_get_functiondef(to_regprocedure(r.sig)));
      IF v_md5 <> r.pin THEN v_fail := v_fail || ('drift:' || r.sig || ':' || v_md5); END IF;
    END IF;
  END LOOP;
  -- Estado anterior auditado: fundação NÃO instalada. Presença parcial => abortar.
  IF to_regprocedure('platform_private.catalog_ownership_enabled()') IS NOT NULL THEN
    v_fail := v_fail || 'partial:catalog_ownership_enabled_present'::text; END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname IN ('produtos','microrganismos','culturas')
               AND a.attname='owner_organization_id' AND NOT a.attisdropped) THEN
    v_fail := v_fail || 'partial:owner_organization_id_present'::text; END IF;
  -- Dependências referenciadas pelos deltas reconciliados.
  IF to_regprocedure('platform_private.c2p1_assignment_allowed(text,uuid,uuid)') IS NULL THEN v_fail := v_fail || 'dep:c2p1_assignment_allowed'::text; END IF;
  IF to_regprocedure('platform_private.c2p1_item_allowed(uuid,uuid,text,uuid,uuid)') IS NULL THEN v_fail := v_fail || 'dep:c2p1_item_allowed'::text; END IF;
  IF to_regprocedure('platform_private.catalog_tenant_actor(text)') IS NULL THEN v_fail := v_fail || 'dep:catalog_tenant_actor'::text; END IF;
  IF to_regprocedure('public.h15_company_access(uuid)') IS NULL THEN v_fail := v_fail || 'dep:h15_company_access'::text; END IF;
  FOREACH v_md5 IN ARRAY ARRAY['produtos','microrganismos','culturas','commercial_condition_item_prices',
      'catalog_tenant_visibility','catalog_tenant_visibility_ledger','fiscal_invoices','fiscal_invoice_items'] LOOP
    IF to_regclass('public.' || v_md5) IS NULL THEN v_fail := v_fail || ('dep:table:' || v_md5); END IF;
  END LOOP;
  IF cardinality(v_fail) > 0 THEN
    RAISE EXCEPTION 'ownership_pre_global_failed' USING DETAIL = array_to_string(v_fail, ' | ');
  END IF;
END $pre$;
COMMIT;
"""


def main():
    out = {}
    comparisons = []
    for c in LIVE["comparison"]:
        comparisons.append(dict(file=c["file"], signature=c["signature"], expected_original=c["expected"],
                                actual_live=c["actual"], equal=c["expected"] == c["actual"],
                                resolution=("unchanged" if c["expected"] == c["actual"] else "reconciled_minimal_delta")))
    assert len(comparisons) == 17 and sum(x["equal"] for x in comparisons) == 14
    for k in ("09", "10", "13"):
        body, pin, rec = reconcile(k)
        assert pin != ORIG_EXPECTED[k]
        name = FILES[k].replace(".sql", "-reconciled.sql.review")
        (HERE / name).write_text(emit_file(k, body, pin, rec))
        (HERE / f"reconciled-{k}.function.sql").write_text(rec)
        out[k] = dict(file=name, live_md5=pin, original_expected=ORIG_EXPECTED[k],
                      reconciled_body_md5_textual=md5(rec), deltas=[a for a, _, _ in DELTAS[k]])
    (HERE / "00-pre-global-foundation.sql.review").write_text(pre_global())
    manifest_order = [f["path"] for f in MANIFEST["files"]]
    pins = dict(project_ref=LIVE["project_ref"], status="NO_GO", apply_authorized=False,
                comparisons=comparisons, reconciled=out, manifest_order=manifest_order,
                original_manifest_sha256={f["path"]: f["sha256"] for f in MANIFEST["files"]},
                original_sources_sha256={FILES[k]: sha(RBAC / FILES[k]) for k in FILES},
                live_capture_sha256=sha(EVID / "live_foundation_pins.json"),
                generated_sha256={p.name: sha(p) for p in sorted(HERE.glob("*.review"))})
    (HERE / "foundation-pins.json").write_text(json.dumps(pins, indent=1, ensure_ascii=False))
    print(json.dumps({k: v["file"] for k, v in out.items()}, ensure_ascii=False))


if __name__ == "__main__":
    main()
