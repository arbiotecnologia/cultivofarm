"""Offline exact-definition delta; never connects or reads captures outside explicit input."""
import argparse,json,hashlib
from pathlib import Path
H=Path(__file__).resolve().parent
FRESH='platform_private.recorte_a_actor_fresh(text)'
TARGETS=['platform_private.product_dossier_management_create(uuid,uuid)','platform_private.product_dossier_management_save(uuid,uuid,timestamp with time zone,jsonb)','platform_private.product_dossier_management_context(uuid)','platform_private.product_dossier_version_detail(uuid,uuid)','platform_private.product_dossier_link_integrity()','platform_private.product_dossier_coverage(uuid)','platform_private.product_dossier_read_scope(uuid,uuid)','platform_private.product_dossier_manage_scope(uuid,uuid)','platform_private.product_dossier_write_guard()','platform_private.rpc_regulatory_product_document_access(uuid,uuid,uuid)','platform_private.product_dossier_row_read(uuid)','platform_private.product_dossier_lock(uuid,uuid,timestamp with time zone)','platform_private.product_dossier_upload_prepare(uuid,uuid,timestamp with time zone,uuid,jsonb)','platform_private.product_dossier_upload_finalize(uuid)','platform_private.product_dossier_upload_access(uuid)','platform_private.product_dossier_upload_pending(uuid)','platform_private.product_dossier_upload_cancel_begin(uuid)']
UPLOAD_CALLER_TARGETS={s for s in TARGETS if '.product_dossier_upload_' in s}
def validate_signatures(signatures,schemas=('public','platform_private')):
 import re
 values=list(signatures);alt='|'.join(re.escape(x) for x in schemas)
 if len(set(values))!=len(values) or any(not re.fullmatch(r'(?:'+alt+r')\.[a-z_][a-z_0-9]*\([^()]*\)',s) or ', ' in s for s in values):
  raise ValueError('qualified unique identity-type signatures required; recapture locally, never normalize pins')
def insert_begin(body,text):
 # First executable BEGIN only; declarations are untouched.
 import re
 matches=list(re.finditer(r'\bBEGIN\b',body,re.I))
 if not matches:raise ValueError('missing BEGIN')
 m=matches[0];return body[:m.end()]+'\n'+text+'\n'+body[m.end():]
def extend(sig,body):
 if 'management_create(' in sig:return insert_begin(body,"IF p_microorganism_id IS NULL THEN RETURN platform_private.product_dossier_structured_create(p_product_id); END IF;")
 if 'management_save(' in sig:return insert_begin(body,"IF EXISTS(SELECT 1 FROM public.microorganism_regulatory_dossiers WHERE id=p_dossier_id AND product_id=p_product_id AND product_only) THEN RETURN platform_private.product_dossier_structured_save(p_product_id,p_dossier_id,p_expected_updated_at,p_patch); END IF;")
 if 'version_detail(' in sig:return insert_begin(body,"IF EXISTS(SELECT 1 FROM public.microorganism_regulatory_dossiers WHERE id=p_dossier_id AND product_id=p_product_id AND product_only) THEN RETURN platform_private.product_dossier_structured_detail(p_product_id,p_dossier_id); END IF;")
 if 'management_context(' in sig:
  # Return canonical biological context unchanged; additive capability only after fresh scope.
  prefix="""IF EXISTS(SELECT 1 FROM public.produtos WHERE id=p_product_id AND familia_catalogo IN ('quimico','fertilizante_adubo')) AND NOT EXISTS(SELECT 1 FROM public.product_regulatory_dossier_links l JOIN public.microorganism_regulatory_dossiers z ON z.id=l.dossier_id WHERE l.product_id=p_product_id AND NOT z.product_only) AND coalesce((SELECT enabled FROM platform_private.product_dossier_structured_gate WHERE singleton),false) THEN
  PERFORM platform_private.product_dossier_structured_scope(p_product_id,'read_catalog');
  DECLARE result jsonb; BEGIN result:=jsonb_build_object('product_id',p_product_id,'can_edit',platform_private.product_dossier_structured_can_edit(p_product_id),'product_only_enabled',true,'product_only_dossier_id',(SELECT scoped_dossier.id FROM public.product_regulatory_dossier_links l JOIN public.microorganism_regulatory_dossiers scoped_dossier ON scoped_dossier.id=l.dossier_id WHERE l.product_id=p_product_id AND scoped_dossier.product_only AND scoped_dossier.deleted_at IS NULL),'dossier_microorganism_id',(SELECT scoped_dossier.microorganism_id FROM public.product_regulatory_dossier_links l JOIN public.microorganism_regulatory_dossiers scoped_dossier ON scoped_dossier.id=l.dossier_id WHERE l.product_id=p_product_id AND scoped_dossier.deleted_at IS NULL),'microorganisms','[]'::jsonb,'versions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'version',version,'status',status) ORDER BY version DESC) FROM public.microorganism_regulatory_dossiers WHERE product_id=p_product_id AND deleted_at IS NULL),'[]'::jsonb)); PERFORM platform_private.product_dossier_structured_scope(p_product_id,'read_catalog'); RETURN result; END; END IF;"""
  # fresh scope also immediately before RETURN to recheck gate/actor after composed reads
  return insert_begin(body,prefix)
 if 'link_integrity(' in sig:
  return insert_begin(body,"""IF EXISTS(SELECT 1 FROM public.microorganism_regulatory_dossiers WHERE id=NEW.dossier_id AND product_id=NEW.product_id AND product_only AND microorganism_id IS NULL AND deleted_at IS NULL) THEN
 PERFORM platform_private.product_dossier_structured_scope(NEW.product_id,'mutate');
 PERFORM 1 FROM public.produtos WHERE id=NEW.product_id FOR SHARE;
 PERFORM platform_private.product_dossier_structured_scope(NEW.product_id,'mutate');
 IF NOT EXISTS(SELECT 1 FROM platform_private.product_dossier_write_permits WHERE txid=txid_current() AND dossier_id=NEW.dossier_id) OR (TG_OP='UPDATE' AND NEW.product_id IS DISTINCT FROM OLD.product_id) THEN RAISE EXCEPTION 'DOSSIER_LINK_DENIED' USING ERRCODE='42501'; END IF;
 NEW.updated_at:=clock_timestamp(); RETURN NEW; END IF;""")
 if 'coverage(' in sig:
  # SQL helper: null no longer means ARRAY[NULL]. Preserve all non-product-only results.
  import re
  replacement="CASE WHEN product_only THEN '{}'::uuid[] WHEN cardinality(covered_microorganism_ids)=0 THEN ARRAY[microorganism_id] ELSE covered_microorganism_ids END"
  pattern=r'CASE WHEN cardinality\(covered_microorganism_ids\)\s*=\s*0 THEN ARRAY\[microorganism_id\] ELSE covered_microorganism_ids END'
  new,n=re.subn(pattern,replacement,body,flags=re.I)
  if n!=1:raise ValueError('coverage anchor drift')
  return new
 if 'read_scope(' in sig or 'manage_scope(' in sig:
  return insert_begin(body,"IF EXISTS(SELECT 1 FROM public.product_regulatory_dossier_links l JOIN public.microorganism_regulatory_dossiers scoped_dossier ON scoped_dossier.id=l.dossier_id WHERE l.product_id=p_product AND scoped_dossier.product_only) THEN IF p_micro IS NOT NULL THEN RAISE EXCEPTION 'DOSSIER_MICRO_MISMATCH' USING ERRCODE='42501'; END IF; RETURN platform_private.product_dossier_structured_scope(p_product,'"+('mutate' if 'manage_scope(' in sig else 'read_catalog')+"'); END IF;")
 if 'write_guard(' in sig:
  return insert_begin(body,"""IF TG_TABLE_NAME='microorganism_regulatory_dossiers' THEN IF TG_OP='UPDATE' THEN IF NEW.product_only IS DISTINCT FROM OLD.product_only THEN RAISE EXCEPTION 'DOSSIER_SCOPE_IMMUTABLE' USING ERRCODE='42501'; END IF; END IF; IF TG_OP<>'DELETE' THEN IF NEW.product_only THEN
 IF TG_OP='UPDATE' AND (NOT OLD.product_only OR NEW.product_id IS DISTINCT FROM OLD.product_id OR NEW.microorganism_id IS DISTINCT FROM OLD.microorganism_id) THEN RAISE EXCEPTION 'DOSSIER_SCOPE_IMMUTABLE' USING ERRCODE='42501'; END IF;
 PERFORM platform_private.product_dossier_structured_scope(NEW.product_id,'mutate');
 IF NEW.structured_data IS NOT NULL THEN PERFORM platform_private.product_dossier_structured_validate(NEW.structured_data,NEW.id); END IF;
 IF NEW.status<>'DRAFT' OR NEW.technical_review_status<>'PENDING' OR NEW.regulatory_review_status<>'PENDING' OR NEW.fiscal_review_status<>'PENDING' THEN RAISE EXCEPTION 'DOSSIER_REVIEW_CLOSED' USING ERRCODE='42501'; END IF;
 END IF; END IF; END IF;""")
 if 'row_read(' in sig:
  return insert_begin(body,"IF EXISTS(SELECT 1 FROM public.microorganism_regulatory_dossiers WHERE id=p_dossier AND product_only AND deleted_at IS NULL) THEN PERFORM platform_private.product_dossier_structured_scope((SELECT product_id FROM public.microorganism_regulatory_dossiers WHERE id=p_dossier),'read_catalog'); RETURN true; END IF;")
 if sig=='platform_private.product_dossier_lock(uuid,uuid,timestamp with time zone)' or sig in UPLOAD_CALLER_TARGETS:
  import re
  # These are caller-fenced operations, including access/pending: canonical
  # manage_scope + uploader ownership are preserved, NOT broadened to read_catalog.
  # attest/cancel are service-only and never reach this extension.
  if 'require_service_role' in body:raise ValueError('service-only upload must remain unchanged')
  product='p_product_id' if ('lock(' in sig or 'prepare(' in sig or 'pending(' in sig) else 'u.product_id'
  if product=='u.product_id' and not re.search(r'\bu\s+platform_private\.product_dossier_uploads\b',body,re.I):raise ValueError('upload record alias drift')
  if product=='u.product_id' and not re.search(r'SELECT\s+\*\s+INTO\s+u\s+FROM\s+platform_private\.product_dossier_uploads',body,re.I):raise ValueError('upload record load drift')
  guard="IF EXISTS(SELECT 1 FROM public.product_regulatory_dossier_links l JOIN public.microorganism_regulatory_dossiers scoped_dossier ON scoped_dossier.id=l.dossier_id WHERE l.product_id="+product+" AND scoped_dossier.product_only) THEN PERFORM platform_private.product_dossier_structured_scope("+product+",'mutate'); END IF;"
  # Reauthorize after EACH observed lock statement and immediately before EACH return.
  body=re.sub(r'(PERFORM pg_advisory_xact_lock\([^;]+;|SELECT[^;]+FOR UPDATE[^;]*;)',lambda m:m.group(0)+'\n'+guard,body,flags=re.I)
  body=re.sub(r'\bRETURN\b',guard+' RETURN',body,flags=re.I)
  return body
 if 'document_access(' in sig:
  return insert_begin(body,"""IF p_microorganism_id IS NULL THEN
 PERFORM platform_private.product_dossier_structured_scope(p_product_id,'read_catalog');
 SELECT doc.* INTO x FROM public.microorganism_regulatory_dossiers d JOIN public.microorganism_regulatory_documents doc ON doc.dossier_id=d.id WHERE d.product_id=p_product_id AND d.product_only AND d.deleted_at IS NULL AND doc.deleted_at IS NULL AND doc.id=p_document_id;
 IF x.id IS NULL OR x.storage_bucket<>'fiscal-regulatorio' OR NOT public.fn_regulatory_storage_path_ok(x.storage_path) OR split_part(x.storage_path,'/',2)<>x.dossier_id::text OR split_part(x.storage_path,'/',3)<>x.id::text THEN RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM platform_private.product_dossier_structured_scope(p_product_id,'read_catalog');
 RETURN jsonb_build_object('document_id',x.id,'dossier_id',x.dossier_id,'product_id',p_product_id,'bucket',x.storage_bucket,'path',x.storage_path,'sha256',x.content_sha256); END IF;""")
 raise ValueError('unknown target')
def build(definitions,pins):
 validate_signatures(definitions)
 if not set(TARGETS+[FRESH]).issubset(definitions) or set(pins)!=set(definitions):raise ValueError('exact definition closure required')
 for sig,body in definitions.items():
  if hashlib.md5(body.encode()).hexdigest()!=pins[sig]:raise ValueError('definition pin mismatch: '+sig)
 result=(H/'delta.sql.review').read_text()
 for sig in TARGETS:
  body=extend(sig,definitions[sig])
  # PL/pgSQL adapters must not preserve STABLE outer snapshots on fresh paths.
  if 'LANGUAGE plpgsql' in body:
   import re
   body=re.sub(r'\bSTABLE\b','VOLATILE',body,flags=re.I)
  result+='\n'+body.rstrip().removesuffix(';')+';\n'
 for sig,body in definitions.items():
  if sig.startswith('public.'):
   import re
   if not any(name in sig for name in ['tenant_product_dossier_', 'rpc_regulatory_product_document_access']):raise ValueError('unexpected public wrapper')
   # Service-only attest/cancel dispatch never needs a caller fresh guard.
   service_wrapper=bool(re.search(r'\.tenant_product_dossier_upload_(?:attest|cancel)\(',sig))
   result+='\n'+(body if service_wrapper else re.sub(r'\bSTABLE\b','VOLATILE',body,flags=re.I)).rstrip().removesuffix(';')+';\n'
 return result
if __name__=='__main__':
 a=argparse.ArgumentParser();a.add_argument('--input',required=True);a.add_argument('--ref',required=True);a.add_argument('--output',required=True);v=a.parse_args();c=json.loads(Path(v.input).read_text())
 if v.ref not in ['swzpzcwiasxmjutrmvkm','vrlcdwmlytukrjezrrnf'] or c.get('ref')!=v.ref or c.get('provenance')!='root-local-exact-catalog':raise ValueError('explicit root-local binding required')
 Path(v.output).write_text(build(c['definitions'],c['pins']),encoding='utf-8',newline='\n')
