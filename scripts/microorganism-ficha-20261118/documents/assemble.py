#!/usr/bin/env python3
"""Offline additive HML assembly. Requires reviewed full capture; never connects/applies."""
import hashlib,json,sys
from pathlib import Path
H=Path(__file__).resolve().parent
SIGNATURES=[
'platform_private.catalog_tenant_actor(text)',
'public.tenant_catalog_root_save(text,uuid,jsonb,timestamp with time zone,uuid)',
'platform_private.tenant_catalog_receipt(uuid,uuid,text)',
'public.tenant_microorganism_ficha_save_v1(uuid,timestamp with time zone,timestamp with time zone,jsonb,jsonb,uuid)',
]
EXPECTED=['5e0ce9cc9122f1c21d76e29a13de8b59','7db253bcc2150276ea2bb2f7bd90e471','e0215d187cf055064e05c76a13dd55d4','52ba09db7c85a5cf028ddbb5951652a8']
PUBLIC=[
'public.tenant_micro_document_list_v1(uuid)',
'public.tenant_micro_document_prepare_v1(uuid,timestamp with time zone,uuid,integer,jsonb,uuid)',
'public.tenant_micro_document_upload_snapshot_v1(uuid,uuid)',
'public.tenant_micro_document_commit_v1(uuid,uuid)',
'public.tenant_micro_document_open_snapshot_v1(uuid,uuid)',
]
def assemble(capture,out):
 if capture.get('ref')!='vrlcdwmlytukrjezrrnf':raise ValueError('HML_REF_REQUIRED')
 functions={f['signature'].replace(', ', ','):f for f in capture['functions']}
 checks=[]
 for signature,expected in zip(SIGNATURES,EXPECTED):
  f=functions.get(signature,{})
  if f.get('md5')!=expected or hashlib.md5(f.get('definition','').encode()).hexdigest()!=expected:raise ValueError('DEPENDENCY_PIN:'+signature)
  if not isinstance(f.get('acl'),list) or not f.get('owner'):raise ValueError('ACL_CAPTURE_REQUIRED')
  acl=json.dumps(sorted(f['acl'])).replace("'","''")
  checks.append(f"IF md5(pg_get_functiondef(to_regprocedure('{signature}'))) IS DISTINCT FROM '{expected}' OR (SELECT rolname FROM pg_roles WHERE oid=(SELECT proowner FROM pg_proc WHERE oid=to_regprocedure('{signature}'))) IS DISTINCT FROM '{f['owner']}' OR (SELECT coalesce(jsonb_agg(a::text ORDER BY a::text),'[]') FROM pg_proc p LEFT JOIN LATERAL unnest(coalesce(p.proacl,acldefault('f',p.proowner))) a ON true WHERE p.oid=to_regprocedure('{signature}')) IS DISTINCT FROM '{acl}'::jsonb THEN RAISE EXCEPTION 'DOCUMENT_PRE_DRIFT:{signature}'; END IF;")
 # Relation fingerprints are caller-provided exact read-only capture outputs, including policies/triggers/constraints/ACL.
 relations=capture.get('relations',[])
 if {r['name'] for r in relations}!={'public.microrganismos','platform_private.tenant_catalog_root_receipts','storage.objects'}:raise ValueError('RELATION_CAPTURE_REQUIRED')
 for r in relations:
  if not isinstance(r.get('fingerprint'),dict):raise ValueError('RELATION_FINGERPRINT_REQUIRED')
  literal=json.dumps(r['fingerprint'],sort_keys=True).replace("'","''")
  checks.append(f"IF pg_temp.micro_document_relation_pin('{r['name']}') IS DISTINCT FROM '{literal}'::jsonb THEN RAISE EXCEPTION 'DOCUMENT_RELATION_DRIFT:{r['name']}'; END IF;")
 bucket=capture.get('bucket')
 if bucket!={'id':'microorganism-documents','public':False,'file_size_limit':10485760}:raise ValueError('PRIVATE_BUCKET_10M_REQUIRED')
 pre=(H/'pin-helper.sql.review').read_text()+"\nDO $pre$ BEGIN\n"+'\n'.join(checks)+"\nIF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='microorganism-documents' AND public=false AND file_size_limit=10485760) THEN RAISE EXCEPTION 'DOCUMENT_BUCKET_DRIFT'; END IF;\nEND $pre$;\n"
 body=(H/'schema.sql.review').read_text()
 digest=hashlib.sha256(body.encode()).hexdigest()
 guard="IF to_regclass('platform_private.micro_documents_gate_v1') IS NULL THEN EXECUTE $body$"+body+"$body$; ELSE IF (SELECT source_sha256 FROM platform_private.micro_documents_install_v1 WHERE singleton) IS DISTINCT FROM '"+digest+"' THEN RAISE EXCEPTION 'DOCUMENT_INSTALL_DRIFT'; END IF; END IF;"
 # Persist exact post-install function definitions/ACL and metadata fingerprint for drift-safe reruns/release/rollback.
 ledger="CREATE TABLE platform_private.micro_documents_install_v1(singleton boolean PRIMARY KEY,source_sha256 text,functions jsonb,relations jsonb);REVOKE ALL ON platform_private.micro_documents_install_v1 FROM PUBLIC,anon,authenticated,service_role;"
 names="'micro_document_context_v1','micro_document_immutable_v1','tenant_micro_document_list_v1','tenant_micro_document_prepare_v1','tenant_micro_document_upload_snapshot_v1','tenant_micro_document_commit_v1','tenant_micro_document_open_snapshot_v1','micro_document_attest_bytes_v1'"
 function_query=f"SELECT jsonb_object_agg(oid::regprocedure::text,jsonb_build_object('md5',md5(pg_get_functiondef(oid)),'owner',proowner::regrole::text)) FROM pg_proc WHERE proname IN ({names})"
 guard=guard.replace(body,body+'\n'+ledger+f"INSERT INTO platform_private.micro_documents_install_v1 VALUES(true,'{digest}',({function_query}),jsonb_build_object('uploads',pg_temp.micro_document_relation_pin('platform_private.micro_document_uploads_v1'),'versions',pg_temp.micro_document_relation_pin('platform_private.micro_document_versions_v1')));")
 post=f"DO $post$ BEGIN IF ({function_query}) IS DISTINCT FROM (SELECT functions FROM platform_private.micro_documents_install_v1 WHERE singleton) THEN RAISE EXCEPTION 'DOCUMENT_POST_FUNCTION_DRIFT'; END IF; IF jsonb_build_object('uploads',pg_temp.micro_document_relation_pin('platform_private.micro_document_uploads_v1'),'versions',pg_temp.micro_document_relation_pin('platform_private.micro_document_versions_v1')) IS DISTINCT FROM (SELECT relations FROM platform_private.micro_documents_install_v1 WHERE singleton) THEN RAISE EXCEPTION 'DOCUMENT_POST_RELATION_DRIFT'; END IF; IF NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='storage.objects'::regclass AND polname='micro_documents_client_closed_v1' AND NOT polpermissive AND polcmd='*' AND pg_get_expr(polqual,polrelid)='(bucket_id <> ''microorganism-documents''::text)' AND pg_get_expr(polwithcheck,polrelid)='(bucket_id <> ''microorganism-documents''::text)') THEN RAISE EXCEPTION 'DOCUMENT_STORAGE_POLICY_DRIFT'; END IF; IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.proname IN ({names}) AND a.grantee<>p.proowner AND (a.privilege_type<>'EXECUTE' OR a.is_grantable OR NOT ((a.grantee='authenticated'::regrole AND p.proname LIKE 'tenant_micro_document_%') OR (a.grantee='service_role'::regrole AND p.proname='micro_document_attest_bytes_v1')))) THEN RAISE EXCEPTION 'DOCUMENT_ACL_DRIFT'; END IF; END $post$;"
 out.mkdir(parents=True,exist_ok=True)
 (out/'01-pre.sql.review').write_text(pre)
 (out/'02-install.sql.review').write_text('BEGIN;\n'+pre+'DO $install$ BEGIN '+guard+' END $install$;\n'+post+'\nCOMMIT;\n')
 (out/'03-post.sql.review').write_text((H/'pin-helper.sql.review').read_text()+'\n'+post+'\nSELECT enabled FROM platform_private.micro_documents_gate_v1;\n')
 release='\n'.join('GRANT EXECUTE ON FUNCTION '+signature+' TO authenticated;' for signature in PUBLIC)
 release+='\nGRANT EXECUTE ON FUNCTION public.micro_document_attest_bytes_v1(uuid,text,integer,text) TO service_role;\nUPDATE platform_private.micro_documents_gate_v1 SET enabled=true WHERE singleton;'
 (out/'05-release.sql.review').write_text('BEGIN;\n'+pre+post+'\n'+release+'\nCOMMIT;')
 rollback='UPDATE platform_private.micro_documents_gate_v1 SET enabled=false WHERE singleton;\n'+ '\n'.join('REVOKE ALL ON FUNCTION '+signature+' FROM PUBLIC,anon,authenticated,service_role;' for signature in PUBLIC+['public.micro_document_attest_bytes_v1(uuid,text,integer,text)'])
 (out/'04-rollback.sql.review').write_text('BEGIN;\n'+rollback+'\nCOMMIT;\n-- Retain private objects, reservations, versions, receipts and Storage deny policy.\n')
 (out/'binding.json').write_text(json.dumps({'ref':capture['ref'],'MICRO_DOCUMENTS_PROJECT_REF':capture['ref'],'bucket':bucket,'source_sha256':digest},indent=2))
if __name__=='__main__':assemble(json.loads(Path(sys.argv[1]).read_text()),Path(sys.argv[2]))
