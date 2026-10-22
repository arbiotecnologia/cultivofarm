"""Local deterministic assembly, never a hosted executor."""
from pathlib import Path
import json,re,hashlib,difflib
H=Path(__file__).resolve().parent; ROOT=H.parents[2]
rows=json.loads((H/'baseline.json').read_text())
def baseline(name):
 return next(r['definition'] for r in rows if r['signature']==name)
def put(name,s): (H/name).write_text(s+'\n')
read=(H/'readers.sql.review').read_text()
projection=baseline('platform_private.b2b_commercial_partner_projection()')
projection=projection.replace("RETURN result||jsonb_build_object", "RETURN result||jsonb_build_object('contract',c->>'contract','actor_id',c->'actor_id','tenant_id',c->'tenant_id','external_roles',c->'external_roles','manager',c->'manager','technician',c->'technician','producer_links_valid',c->'producer_links_valid')||jsonb_build_object")
contexts=baseline('get_my_available_portal_contexts()')
contexts=contexts.replace("IF partner THEN contexts:=array_append(contexts,'b2b'); END IF;", "IF partner AND public.has_role(u,'parceiro_b2b') THEN contexts:=array_append(contexts,'b2b'); END IF;\n IF partner AND public.has_role(u,'parceiro_b2b_tecnico') THEN tech:=true; END IF;\n IF public.has_role(u,'cliente_produtor') AND platform_private.c2_producer_links(u,org) THEN contexts:=array_append(contexts,'producer'); END IF;")
contexts=contexts.replace("RETURN jsonb_build_object('available_contexts',contexts,'default_context',def", "RETURN jsonb_build_object('contract','C2_MULTIPROFILE_V1','actor_id',u,'tenant_id',org,'partner_id',(platform_private.b2b_commercial_context()->>'partner_id')::uuid,'ready',true,'producer_links_valid',platform_private.c2_producer_links(u,org),'available_contexts',contexts,'default_context',def")
contexts=contexts.replace("'has_b2b_access',management OR partner", "'has_b2b_access',management OR (partner AND public.has_role(u,'parceiro_b2b'))")
preferences=[]
for name in ['set_my_context_preference(text,boolean)','register_my_login_redirect_secure(text)']:
 s=baseline(name).replace("('b2b','technical','admin')","('b2b','technical','producer','admin')")
 # Serialize with lifecycle before membership resolution, not after preferences.
 s=s.replace('  v_available := public.get_my_available_portal_contexts();',"  PERFORM 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE;\n  IF NOT FOUND THEN RAISE EXCEPTION 'c2_guard_unavailable'; END IF;\n  v_available := public.get_my_available_portal_contexts();")
 preferences.append(s)
put('readers.assembled.sql.review',read+'\n'+projection+'\n'+contexts+'\n'+'\n'.join(preferences))
scope=baseline('platform_private.external_provisioning_scope(uuid,app_role,uuid,uuid[],uuid)')
# Preserve singular legacy function and add compatible array overload. Snapshot
# reuses existing receipt JSON; no new identity or implicit client mapping.
scope=scope.replace('p_role app_role,','p_roles app_role[],').replace('org uuid; snapshot jsonb;','org uuid; snapshot jsonb; partner_snapshot jsonb; p_role public.app_role;')
scope=scope.replace(" IF p_role = 'parceiro_b2b' THEN", " IF p_roles IS NULL OR cardinality(p_roles) NOT BETWEEN 1 AND 3 OR array_position(p_roles,NULL) IS NOT NULL OR cardinality(p_roles)<>(SELECT count(DISTINCT r) FROM unnest(p_roles) r) OR EXISTS(SELECT 1 FROM unnest(p_roles) r WHERE r NOT IN ('parceiro_b2b','parceiro_b2b_tecnico','cliente_produtor')) THEN RAISE EXCEPTION 'c2_invalid_roles' USING ERRCODE='22023'; END IF;\n IF p_partner IS NOT NULL THEN\n IF NOT ('parceiro_b2b'=ANY(p_roles) OR 'parceiro_b2b_tecnico'=ANY(p_roles)) THEN RAISE EXCEPTION 'c2_partner_role_required'; END IF;")
scope=scope.replace("cardinality(p_clients) IS DISTINCT FROM 0 OR p_primary IS NOT NULL", "(NOT ('cliente_produtor'=ANY(p_roles)) AND (cardinality(p_clients) IS DISTINCT FROM 0 OR p_primary IS NOT NULL))")
scope=scope.replace('INTO snapshot FROM public.partner_accounts','INTO partner_snapshot FROM public.partner_accounts')
scope=scope.replace(" ELSE\n IF p_role IS DISTINCT FROM 'cliente_produtor' OR p_partner IS NOT NULL", " IF partner_snapshot IS NULL THEN RAISE EXCEPTION 'external_provisioning_forbidden'; END IF;\n END IF;\n IF 'cliente_produtor'=ANY(p_roles) THEN\n IF")
scope=scope.replace(" IF snapshot IS NULL THEN", " IF 'cliente_produtor'=ANY(p_roles) AND EXISTS(SELECT 1 FROM unnest(p_clients) cid WHERE NOT EXISTS(SELECT 1 FROM public.fazendas f WHERE f.cliente_id=cid AND f.organization_id=org AND f.ativo)) THEN RAISE EXCEPTION 'c2_producer_farm_required'; END IF;\n IF p_partner IS NULL AND p_roles IS DISTINCT FROM ARRAY['cliente_produtor']::public.app_role[] THEN RAISE EXCEPTION 'c2_partner_required'; END IF;\n snapshot:=jsonb_build_object('partner',partner_snapshot,'clients',snapshot,'roles',to_jsonb(p_roles));\n IF snapshot IS NULL THEN")
claim=baseline('platform_private.b2b_claim_provisioning(uuid,uuid,text,text,app_role,uuid[],uuid)')
claim=claim.replace("p_role app_role DEFAULT 'parceiro_b2b'::app_role",'p_roles app_role[]')
claim=claim.replace("  IF p_role = 'parceiro_b2b' THEN\n PERFORM public.b2b_provisioning_preflight(p_partner,p_role::text,'gestor'); END IF;",'')
claim=claim.replace(" IF p_role = 'parceiro_b2b' THEN\n PERFORM public.b2b_provisioning_preflight(p_partner,p_role::text,'gestor'); END IF;",'')
claim=claim.replace('auth.uid(),p_role,p_partner','auth.uid(),p_roles,p_partner')
claim=claim.replace('external_role,cliente_ids','external_role,external_roles,cliente_ids')
claim=claim.replace('invitation,p_role,p_clients','invitation,p_roles[1],p_roles,p_clients')
claim=claim.replace('r.external_role,r.cliente_ids','r.external_roles,r.cliente_ids').replace('invitation,p_role,p_clients','invitation,p_roles,p_clients')
# Row comparator does not include redundant compatibility singular role.
claim=claim.replace('stamp,issued,invitation,p_roles[1],p_roles,p_clients,p_primary,ctx', 'stamp,issued,invitation,p_roles,p_clients,p_primary,ctx') if False else claim
claim=claim.replace('ROW((ctx->>\'organization_id\')::uuid,p_partner,lower(trim(p_email)),trim(p_nome),stamp,issued,invitation,p_roles[1],p_roles,p_clients', 'ROW((ctx->>\'organization_id\')::uuid,p_partner,lower(trim(p_email)),trim(p_nome),stamp,issued,invitation,p_roles,p_clients')
claim=claim.replace("'claim_id',r.id", "'contract','C2_MULTIPROFILE_V1','external_roles',r.external_roles,'actor_id',r.actor_id,'partner_id',r.partner_id,'readers_ready',true,'provisioning_ready',true,'producer_links_valid','cliente_produtor'=ANY(r.external_roles),'claim_id',r.id")
api="""CREATE FUNCTION public.b2b_claim_provisioning(p_partner uuid,p_key uuid,p_email text,p_nome text,p_roles public.app_role[],p_clients uuid[],p_primary uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT platform_private.b2b_claim_provisioning(p_partner,p_key,p_email,p_nome,p_roles,p_clients,p_primary); $$;
REVOKE ALL ON FUNCTION public.b2b_claim_provisioning(uuid,uuid,text,text,public.app_role[],uuid[],uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.b2b_claim_provisioning(uuid,uuid,text,text,public.app_role[],uuid[],uuid) TO authenticated;
REVOKE ALL ON FUNCTION platform_private.external_provisioning_scope(uuid,public.app_role[],uuid,uuid[],uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION platform_private.b2b_claim_provisioning(uuid,uuid,text,text,public.app_role[],uuid[],uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION platform_private.b2b_claim_provisioning(uuid,uuid,text,text,public.app_role[],uuid[],uuid) TO authenticated;
"""
finish=baseline('b2b_finish_provisioning(uuid,uuid,uuid)')
finish=finish.replace('invitation jsonb; ctx jsonb;', 'invitation jsonb; ctx jsonb; rs public.app_role[];')
finish=finish.replace(' PERFORM 1 FROM public.platform_org_admin_invites', ' rs:=COALESCE(r.external_roles,ARRAY[r.external_role]);\n PERFORM 1 FROM public.platform_org_admin_invites',1)
finish=finish.replace('ctx:=platform_private.external_provisioning_scope(r.actor_id,r.external_role,r.partner_id,r.cliente_ids,r.principal_cliente_id);',"IF r.external_roles IS NULL THEN ctx:=platform_private.external_provisioning_scope(r.actor_id,r.external_role,r.partner_id,r.cliente_ids,r.principal_cliente_id); ELSE ctx:=platform_private.external_provisioning_scope(r.actor_id,rs,r.partner_id,r.cliente_ids,r.principal_cliente_id); END IF;")
# Completed receipt cannot re-grant or falsely conflict after independent revoke.
start=finish.index(" IF r.status='completed' THEN")
end=finish.index(" IF r.status<>'claimed' THEN",start)
finish=finish[:start]+""" IF r.status='completed' THEN
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=r.user_id AND lower(email)=r.email AND raw_app_meta_data->>'b2b_provisioning_receipt'=r.id::text) THEN RAISE EXCEPTION 'b2b_provisioning_target_conflict'; END IF;
 RETURN jsonb_build_object('success',true,'user_id',r.user_id,'replay',true);
 END IF;
"""+finish[end:]
finish=finish.replace('ARRAY[r.external_role],r.cliente_ids','rs,r.cliente_ids').replace("CASE WHEN r.partner_id IS NULL THEN NULL ELSE 'gestor' END", "CASE WHEN r.partner_id IS NULL THEN NULL WHEN 'parceiro_b2b'=ANY(rs) THEN 'gestor' ELSE 'tecnico' END")
admin=baseline('admin_provision_user_profile_v1(uuid,text,text,app_role[],uuid[],uuid,uuid,text,text,text,text,text,text)')
admin=admin.replace("  IF v_partner_role_count > 1 THEN\n    RAISE EXCEPTION 'conflicting_partner_roles' USING ERRCODE = '23514';\n  END IF;", "  IF v_partner_role_count > 1 AND NOT EXISTS(SELECT 1 FROM platform_private.b2b_provisioning_receipts r WHERE r.user_id=p_user_id AND r.status='claimed' AND r.external_roles=p_roles AND r.partner_id=p_partner_id) THEN RAISE EXCEPTION 'c2_receipt_required' USING ERRCODE='42501'; END IF;")
admin=admin.replace('v_partner_role_count = 1','v_partner_role_count >= 1')
comp=baseline('b2b_complete_provisioning_compensation(uuid,uuid,uuid)')
comp=comp.replace("papel IS DISTINCT FROM 'gestor'", "tenant_id IS DISTINCT FROM r.organization_id OR papel IS DISTINCT FROM (CASE WHEN 'parceiro_b2b'=ANY(COALESCE(r.external_roles,ARRAY[r.external_role])) THEN 'gestor' ELSE 'tecnico' END)")
comp=comp.replace("AND papel='gestor'", "AND tenant_id=r.organization_id AND papel=(CASE WHEN 'parceiro_b2b'=ANY(COALESCE(r.external_roles,ARRAY[r.external_role])) THEN 'gestor' ELSE 'tecnico' END)")
put('provisioning.sql.review',scope+'\n'+claim+'\n'+api+'\n'+admin+'\n'+finish+'\n'+baseline('b2b_prepare_provisioning_compensation(uuid,uuid,uuid)')+'\n'+comp)
guards=[]
for r in rows:
 sig=r['signature']; sig=sig if sig.startswith('platform_private.') else 'public.'+sig
 guards.append(f"IF (SELECT md5(pg_get_functiondef('{sig}'::regprocedure))) IS DISTINCT FROM '{r['md5']}' OR (SELECT proacl::text FROM pg_proc WHERE oid='{sig}'::regprocedure) IS DISTINCT FROM '{r['acl']}' OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='{sig}'::regprocedure) IS DISTINCT FROM '{r['owner']}' THEN RAISE EXCEPTION 'c2_coordinated_drift'; END IF;")
old=(H.parent/'candidate.sql.review').read_text(); old=old[old.index('CREATE FUNCTION platform_private.c2_partner_lifecycle'):].removesuffix('COMMIT;\n')
# Producer residual is independent and never implicitly creates/reactivates partner.
old=old.replace("IF p_action='assign' AND NOT ('parceiro_b2b'=ANY(requested) OR 'parceiro_b2b_tecnico'=ANY(requested)) THEN", "IF p_action='assign' AND link.id IS NULL AND NOT ('parceiro_b2b'=ANY(requested) OR 'parceiro_b2b_tecnico'=ANY(requested)) THEN")
constraints="""ALTER TABLE platform_private.b2b_provisioning_receipts ADD COLUMN external_roles public.app_role[];
ALTER TABLE public.user_access_preferences DROP CONSTRAINT user_access_preferences_last_context_chk, DROP CONSTRAINT user_access_preferences_preferred_context_chk;
ALTER TABLE public.user_access_preferences ADD CONSTRAINT user_access_preferences_last_context_chk CHECK(last_context IS NULL OR last_context IN ('b2b','technical','producer','admin')), ADD CONSTRAINT user_access_preferences_preferred_context_chk CHECK(preferred_context IS NULL OR preferred_context IN ('b2b','technical','producer','admin'));
"""
put('candidate.sql.review',"-- INACTIVE COMPLETE COORDINATED CANDIDATE; NO HOSTED EXECUTOR\nBEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';\nDO $$ BEGIN\n"+'\n'.join(guards)+"\nEND $$;\n"+constraints+(H/'readers.assembled.sql.review').read_text()+(H/'provisioning.sql.review').read_text()+old+'\nCOMMIT;')
put('preflight.sql',"-- Read-only; external operator must validate swzpzcwiasxmjutrmvkm first.\nSELECT p.oid::regprocedure,md5(pg_get_functiondef(p.oid)),p.proacl,pg_get_userbyid(p.proowner) FROM pg_proc p WHERE p.oid IN ("+','.join("'"+(r['signature'] if r['signature'].startswith('platform_private.') else 'public.'+r['signature'])+"'::regprocedure" for r in rows)+");\nSELECT conrelid::regclass,conname,pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid IN ('public.partner_users'::regclass,'public.user_roles'::regclass,'public.user_access_preferences'::regclass,'platform_private.b2b_provisioning_receipts'::regclass);\nSELECT tgrelid::regclass,tgname,pg_get_triggerdef(oid),md5(pg_get_functiondef(tgfoid)) FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN ('public.profiles'::regclass,'public.user_roles'::regclass,'public.user_clientes'::regclass,'public.partner_users'::regclass,'auth.users'::regclass);")
put('postflight.sql',"-- Execute under real actor JWT A/B after independent installation only.\nSELECT public.get_my_available_portal_contexts();\nSELECT public.get_my_commercial_partner_context();\nSELECT public.get_my_commercial_partner_projection();\nSELECT md5(pg_get_functiondef('platform_private.b2b_actor_scope(uuid)'::regprocedure))='c3f2997746f24bc2efd15db5c0ccc862' AS immutable_scope;\nSELECT has_function_privilege('anon','public.link_partner_user(uuid,uuid,text[],text,text,uuid,text)','EXECUTE') AS must_be_false;")
put('rollbackdeny.sql.review',"-- SECURITY ROLLBACK ONLY: keeps data/history/server filters; never reinstalls singleton authority.\nBEGIN; SET LOCAL lock_timeout='5s';\nREVOKE EXECUTE ON FUNCTION public.link_partner_user(uuid,uuid,text[],text,text,uuid,text), public.b2b_claim_provisioning(uuid,uuid,text,text,public.app_role[],uuid[],uuid) FROM authenticated;\nCREATE OR REPLACE FUNCTION public.is_valid_b2b_partner_user(p_user_id uuid,p_partner_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$SELECT false$$;\nCOMMIT;")
print('Assembled inactive SQL and read-only pre/postflight')