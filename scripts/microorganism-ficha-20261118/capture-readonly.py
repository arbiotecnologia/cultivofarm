#!/usr/bin/env python3
"""Catalog-only capture. Explicit environment binding, never business/Auth/Vault rows.
Root supplies CAPTURE_REF and CAPTURE_DSN locally; connection values never print.
Output contains schema definitions only. No writer/deployment operation exists here.
"""
import json
import os
from pathlib import Path
import subprocess
import urllib.parse

REFS = {"swzpzcwiasxmjutrmvkm", "vrlcdwmlytukrjezrrnf"}
ref = os.environ.get("CAPTURE_REF")
dsn = urllib.parse.urlparse(os.environ.get("CAPTURE_DSN", ""))
direct = dsn.hostname == f"db.{ref}.supabase.co"
pooler = bool(dsn.hostname and dsn.hostname.endswith(".pooler.supabase.com") and urllib.parse.unquote(dsn.username or "") == f"postgres.{ref}")
if ref not in REFS or not (direct or pooler):
    raise SystemExit("CAPTURE_BINDING_DENIED: no connection attempted")

query = """
SELECT jsonb_build_object(
 'functions',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,
  'definition',pg_get_functiondef(p.oid),'md5',md5(pg_get_functiondef(p.oid)),
  'acl',p.proacl,'owner',pg_get_userbyid(p.proowner))) FROM pg_proc p
  WHERE p.proname IN ('catalog_tenant_actor','tenant_catalog_root_save','tenant_catalog_receipt',
    'tenant_catalog_ref_owner','h15_actor_organization','has_role','platform_actor_access_ready',
    'entitlements_for_user','can_view_catalog_internal','_saas_user_has_feature',
    'set_codigo_microrganismo','tenant_proximo_codigo','prefixo_para_microrganismo',
    'sync_microorganism_pricing','trg_mestre_guard_preco_canonico','fn_catalogo_litro_canonico',
    'catalog_owner_immutable','catalog_touch_version','log_catalog_change','catalog_sources_set_source_key',
    'update_updated_at_column')),
 'config',(SELECT jsonb_agg(c) FROM platform_private.tenant_catalog_root_cfg c
   WHERE root IN ('microrganismos','microorganism_technical_profiles')),
 'columns',(SELECT jsonb_agg(c) FROM information_schema.columns c
   WHERE table_schema='public' AND table_name IN ('microrganismos','microorganism_technical_profiles',
    'microorganism_targets','microorganism_crop_recommendations','catalog_technical_sources','catalogo_alvos','culturas')),
 'constraints',(SELECT jsonb_agg(jsonb_build_object('table',conrelid::regclass::text,'name',conname,'definition',pg_get_constraintdef(oid)))
   FROM pg_constraint WHERE conrelid IN ('public.microrganismos'::regclass,'public.microorganism_technical_profiles'::regclass,
    'public.microorganism_targets'::regclass,'public.microorganism_crop_recommendations'::regclass,'public.catalog_technical_sources'::regclass)),
 'triggers',(SELECT jsonb_agg(jsonb_build_object('table',tgrelid::regclass::text,'definition',pg_get_triggerdef(oid),
   'enabled',tgenabled,'body',pg_get_functiondef(tgfoid))) FROM pg_trigger WHERE NOT tgisinternal
   AND tgrelid IN ('public.microrganismos'::regclass,'public.microorganism_technical_profiles'::regclass,
    'public.microorganism_targets'::regclass,'public.microorganism_crop_recommendations'::regclass,'public.catalog_technical_sources'::regclass)),
 'policies',(SELECT jsonb_agg(p) FROM pg_policies p WHERE schemaname='public' AND tablename IN
   ('microrganismos','microorganism_technical_profiles','microorganism_targets','microorganism_crop_recommendations','catalog_technical_sources','culturas','catalogo_alvos')),
 'grants',(SELECT jsonb_agg(g) FROM information_schema.role_table_grants g WHERE table_schema='public' AND table_name IN
   ('microrganismos','microorganism_technical_profiles','microorganism_targets','microorganism_crop_recommendations','catalog_technical_sources'))
);
"""
env = {**os.environ, "PGHOST": dsn.hostname or "", "PGPORT": str(dsn.port or 5432),
       "PGUSER": urllib.parse.unquote(dsn.username or ""), "PGPASSWORD": urllib.parse.unquote(dsn.password or ""),
       "PGDATABASE": dsn.path.lstrip("/") or "postgres", "PGSSLMODE": "require", "PGCONNECT_TIMEOUT": "10"}
result = subprocess.run(["psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", query],
                        env=env, capture_output=True, text=True, timeout=60)
if result.returncode:
    raise SystemExit("CAPTURE_FAILED: schema unavailable; no credential/error payload printed")
catalog = json.loads(result.stdout)
out = Path(os.environ.get("CAPTURE_OUTPUT", f"/tmp/micro-catalog-{ref}.json"))
out.write_text(json.dumps({"ref": ref, "catalog": catalog}, indent=2) + "\n")
print(json.dumps({"ref": ref, "output": str(out), "catalog_only": True}))