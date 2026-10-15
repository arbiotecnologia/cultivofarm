"""Builds candidate 10 from live definitions captured read-only (2026-10-15 14:31 UTC).
Each patch: pinned md5-before, literal anchor occurrence counts verified locally AND at apply-time."""
import re, sys, hashlib, json
src = open(sys.argv[1]).read()
defs = {}
for m in re.finditer(r'definition:(CREATE OR REPLACE FUNCTION (\w+)\.(\w+)\(.*?)\n hash:([0-9a-f]{32}) proname:(\w+) schema:(\w+)\]', src, re.S):
    defs[f"{m.group(6)}.{m.group(5)}"] = (m.group(1), m.group(4))
P = {
 "public.partner_apply_default_discount": [("  WHERE p.ativo = true\n", "  WHERE p.ativo = true AND p.owner_organization_id IS NULL\n", 1)],
 "public.rpc_commercial_simulator": [
   ("     WHERE p.id = p_product_id;", "     WHERE p.id = p_product_id AND p.owner_organization_id IS NULL;", 1),
   ("        FROM public.produtos p WHERE p.id = p_product_id;", "        FROM public.produtos p WHERE p.id = p_product_id AND p.owner_organization_id IS NULL;", 1),
   ("  -- 1) Campanha ativa\n", "  IF NOT EXISTS (SELECT 1 FROM public.produtos gp WHERE gp.id = p_product_id AND gp.owner_organization_id IS NULL) THEN\n    RAISE EXCEPTION 'product_unavailable' USING ERRCODE='P0002';\n  END IF;\n\n  -- 1) Campanha ativa\n", 1)],
 "public.fn_resolve_commercial_price": [
   ("  IF p_unit_type IS NULL OR p_unit_type NOT IN ('hectare','litro','dose','unidade') THEN\n    RETURN jsonb_build_object('ok',false,'reason_code','UNIT_INVALID','quote_required',false);",
    "  IF NOT EXISTS (SELECT 1 FROM public.produtos gp WHERE gp.id = p_product_id AND gp.owner_organization_id IS NULL)\n     AND NOT EXISTS (SELECT 1 FROM public.microrganismos gm WHERE gm.id = p_microrganismo_id AND gm.owner_organization_id IS NULL) THEN\n    RETURN jsonb_build_object('ok',false,'reason_code','ITEM_INVALID','quote_required',false);\n  END IF;\n  IF p_unit_type IS NULL OR p_unit_type NOT IN ('hectare','litro','dose','unidade') THEN\n    RETURN jsonb_build_object('ok',false,'reason_code','UNIT_INVALID','quote_required',false);", 1)],
 "public.fn_b2b_resolve_base_unit_price": [
   ("  IF p_unit_type IS NULL OR p_unit_type NOT IN ('hectare','litro','dose','unidade') THEN\n    RETURN jsonb_build_object('ok', false, 'reason_code', 'UNIT_INVALID');",
    "  IF NOT EXISTS (SELECT 1 FROM public.produtos gp WHERE gp.id = p_product_id AND gp.owner_organization_id IS NULL)\n     AND NOT EXISTS (SELECT 1 FROM public.microrganismos gm WHERE gm.id = p_microrganismo_id AND gm.owner_organization_id IS NULL) THEN\n    RETURN jsonb_build_object('ok', false, 'reason_code', 'ITEM_INVALID');\n  END IF;\n  IF p_unit_type IS NULL OR p_unit_type NOT IN ('hectare','litro','dose','unidade') THEN\n    RETURN jsonb_build_object('ok', false, 'reason_code', 'UNIT_INVALID');", 1)],
 "public.fn_resolve_b2b_cart": [
   ("        FROM public.produtos WHERE id = v_iid;", "        FROM public.produtos WHERE id = v_iid AND owner_organization_id IS NULL;", 1),
   ("        FROM public.microrganismos WHERE id = v_iid;", "        FROM public.microrganismos WHERE id = v_iid AND owner_organization_id IS NULL;", 1)],
 "platform_private.b2b_save_technical_simulation": [
   ("FROM public.produtos WHERE id=iid AND ativo AND b2b_enabled;", "FROM public.produtos WHERE id=iid AND ativo AND b2b_enabled AND owner_organization_id IS NULL;", 1),
   ("FROM public.microrganismos WHERE id=iid AND ativo AND b2b_enabled;", "FROM public.microrganismos WHERE id=iid AND ativo AND b2b_enabled AND owner_organization_id IS NULL;", 1)],
 "public.rpc_associate_microorganism_fiscal_product": [
   ("FROM public.microrganismos m WHERE m.id = p_microorganism_id)", "FROM public.microrganismos m WHERE m.id = p_microorganism_id AND m.owner_organization_id IS NULL)", 1),
   ("FROM public.produtos p WHERE p.id = p_product_id)", "FROM public.produtos p WHERE p.id = p_product_id AND p.owner_organization_id IS NULL)", 1),
   ("   WHERE m.id = p_microorganism_id\n  RETURNING", "   WHERE m.id = p_microorganism_id AND m.owner_organization_id IS NULL\n  RETURNING", 1)],
 "public.rpc_regulatory_dossier_ensure_draft": [
   ("FROM public.microrganismos WHERE id = p_microorganism_id)", "FROM public.microrganismos WHERE id = p_microorganism_id AND owner_organization_id IS NULL)", 1)],
 "public.rpc_fiscal_draft_save": [
   ("FROM public.produtos pr WHERE pr.id = v_source_id)", "FROM public.produtos pr WHERE pr.id = v_source_id AND pr.owner_organization_id IS NULL)", 1)],
}
def lit(s): return "$anc$" + s + "$anc$"
out = ["-- CANDIDATO 10 — NÃO APLICADO. Gerado por build-ownership10.py a partir de definições live (read-only).",
 "-- Requer 01–06/08/09; gate OFF. Somente filtra roots a globais (owner IS NULL); não altera ACL, autorização, preços ou históricos.",
 "-- Cada função: hash-before fixado; âncoras literais com contagem exata; aborta antes de qualquer replace em drift.",
 "BEGIN;", "DO $g$ BEGIN IF platform_private.catalog_ownership_enabled() THEN RAISE EXCEPTION 'ownership10_gate_must_remain_off'; END IF; END $g$;"]
manifest = []
for fn, patches in P.items():
    body, h = defs[fn]
    new = body
    for old, rep, n in patches:
        c = new.count(old); assert c == n, (fn, old, c); new = new.replace(old, rep)
    sig = re.match(r'CREATE OR REPLACE FUNCTION ([\w.]+\(.*?\))\n', body).group(1)
    pairs = ",\n    ".join(f"ARRAY[{lit(o)},{lit(r)},'{n}']" for o, r, n in patches)
    out.append(f"""DO $p$
DECLARE v_oid regprocedure; v_def text; v_pair text[]; v_pairs text[][] := ARRAY[
    {pairs}];
BEGIN
  SELECT p.oid::regprocedure INTO v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='{fn.split('.')[0]}' AND p.proname='{fn.split('.')[1]}' AND p.prokind='f';
  v_def := pg_get_functiondef(v_oid);
  IF md5(v_def) <> '{h}' THEN RAISE EXCEPTION 'ownership10_drift:{fn}'; END IF;
  FOREACH v_pair SLICE 1 IN ARRAY v_pairs LOOP
    IF (length(v_def)-length(replace(v_def,v_pair[1],'')))/length(v_pair[1]) <> v_pair[3]::int THEN
      RAISE EXCEPTION 'ownership10_anchor:{fn}'; END IF;
    v_def := replace(v_def, v_pair[1], v_pair[2]);
  END LOOP;
  EXECUTE v_def;
  RAISE NOTICE 'ownership10 % hash_after=%', '{fn}', md5(pg_get_functiondef(v_oid));
END $p$;""")
    manifest.append({"function": fn, "hash_before": h, "patches": len(patches)})
out.append("COMMIT;")
open("scripts/rbac-audit/proposed-tenant-catalog-ownership-10-global-roots.sql","w").write("\n".join(out)+"\n")
json.dump(manifest, open("scripts/rbac-audit/ownership10-manifest.json","w"), indent=1)
print(json.dumps(manifest, indent=1))
