"""Build mutually exclusive review variants; never write runtime or hosted DB."""
from pathlib import Path
import hashlib, json, difflib
P=Path(__file__).resolve().parent
C=P.parent/'contracts-c2-20261022/coordinated'
R=P.parents[1]
out=P/'multiprofile'; out.mkdir(exist_ok=True)
core=(P/'core.sql.review').read_text()
start=core.index(' SELECT * INTO s FROM platform_private.b2b_actor_scope(u);')
end=core.index(' SELECT pa.commercial_owner_organization_id INTO owner')
core=core[:start]+""" IF NOT public.is_valid_b2b_partner_user(u,p_partner_id) THEN
 RAISE EXCEPTION 'own_finance_forbidden' USING ERRCODE='42501'; END IF;
"""+core[end:]
core=core.replace("  OR (SELECT count(*) FROM public.user_roles WHERE user_id=u)<>1\n", "")
core=core.replace("AND pu.user_id=u AND pu.papel='gestor'", "AND pu.user_id=u")
readers=(C/'readers.assembled.sql.review').read_text()
needle='CREATE OR REPLACE FUNCTION platform_private.b2b_commercial_partner_projection()'
projection=readers[readers.index(needle):]
projection=projection[:projection.index('END $function$')+len('END $function$')]+';'
projection=projection.replace('sheets boolean:=false;', 'sheets boolean:=false; finance boolean:=false;')
marker=" RETURN result||jsonb_build_object"
assert projection.count(marker)==1
projection=projection.replace(marker,""" BEGIN
 finance:=platform_private.b2b_own_obligations_owner((result->>'id')::uuid) IS NOT NULL;
 EXCEPTION WHEN insufficient_privilege THEN finance:=false; END;
 RETURN result||jsonb_build_object('finance_capabilities',jsonb_build_object(
 'contract','C2_OWN_OBLIGATIONS_V1','obligations_read',finance))||jsonb_build_object""")
expected=readers[readers.index(needle):]
expected=expected[:expected.index('END $function$')+len('END $function$')]
sources=[('platform_private.b2b_commercial_partner_projection()',expected),
 ('platform_private.b2b_commercial_context()',readers[readers.index('CREATE OR REPLACE FUNCTION platform_private.b2b_commercial_context()'):readers.index('-- Projection body')].strip().removesuffix(';')),
 ('public.is_valid_b2b_partner_user(uuid,uuid)',readers[:readers.index('CREATE FUNCTION platform_private.c2_producer_links')].split('\n',1)[1].strip().removesuffix(';'))]
# Exact pg_get_functiondef representation must be captured by the auditor after C2.
# This variant deliberately has no guessed PostgreSQL pretty-printer hashes.
guard="""-- REVIEW ONLY: paired C2+finance variant, NOT standalone finance migration.
-- NO-GO until expected-baseline.json is captured and reviewed from canonical hosted C2.
BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
DO $$ BEGIN RAISE EXCEPTION 'c2_finance_baseline_not_certified' USING ERRCODE='55000'; END $$;
"""
(out/'candidate.sql.review').write_text(guard+core+'\n'+projection+'\nCOMMIT;\n')
(out/'preflight.sql').write_text("-- READ ONLY; canonical ref swzpzcwiasxmjutrmvkm required.\nSELECT p.oid::regprocedure signature,pg_get_functiondef(p.oid) definition,md5(pg_get_functiondef(p.oid)) md5,pg_get_userbyid(p.proowner) owner,p.proacl::text acl FROM pg_proc p WHERE p.oid IN ("+','.join("'%s'::regprocedure"%sig for sig,_ in sources)+");\n")
(out/'expected-sources.json').write_text(json.dumps([{'signature':sig,'review_source_sha256':hashlib.sha256(s.encode()).hexdigest()} for sig,s in sources],indent=2)+'\n')
changes={}
for path in json.loads((P/'frontend-drift.json').read_text()):
 f=P/'runtime-copies'/path
 source=C/'frontend/runtime-copies'/path
 old=(R/path).read_text() if (R/path).exists() else ''
 new=f.read_text()
 if source.exists():
  new=source.read_text()
  if path=='src/hooks/useMyPartner.ts':
   new='import { readOwnFinanceCapability } from "@/lib/comercial/financeAccess";\n'+new
   new=new.replace('ativo: true, capabilities:', 'ativo: true, financeRead: readOwnFinanceCapability(partner.finance_capabilities), capabilities:')
 if path.endswith('PortalParceiroLayout.tsx'):
  new='import { isC2ExternalScope } from "@/lib/authz/multiProfileContract";\n'+new
  new=new.replace('  const isStaff =', '  const externalManager = isC2ExternalScope(roles) && roles.includes("parceiro_b2b");\n  const isStaff =')
  new=new.replace('const isTecnico = role === "parceiro_b2b_tecnico";', 'const isTecnico = !externalManager && role === "parceiro_b2b_tecnico";')
  new=new.replace('if (role && ![', 'if (!externalManager && role && ![')
 changes[path]=(old,new)
patch=[]
for path,(old,new) in changes.items():
 target=out/'runtime-copies'/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(new)
 patch.extend(difflib.unified_diff(old.splitlines(True),new.splitlines(True),fromfile='a/'+path,tofile='b/'+path))
(out/'frontend.patch').write_text(''.join(patch))
print('Prepared inactive paired variant; installation guard is closed')