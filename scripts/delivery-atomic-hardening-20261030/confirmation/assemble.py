"""Review generator, no hosted I/O. Applied sources are immutable dependencies."""
from pathlib import Path
import json,sys,hashlib
H=Path(__file__).resolve().parent; ROOT=H.parents[2]
sys.path.insert(0,str(ROOT/'scripts/stock-envase-recovery-20261027/isolated'))
import assemble as envase_assemble
# Import by path avoids same module name collision.
import importlib.util
spec=importlib.util.spec_from_file_location('envase_state',ROOT/'scripts/stock-envase-recovery-20261027/isolated/assemble.py'); E=importlib.util.module_from_spec(spec);spec.loader.exec_module(E)
RPC='public.rpc_entrega_confirmar_manual_v1(uuid,timestamptz,text,jsonb)'
CAP='public.rpc_entrega_confirmacao_capability_v1(uuid)'
STATE=E.STATE.replace(E.TABLES,E.TABLES+",'entrega_comprovantes','entrega_documentos','entrega_checklist','entrega_termos','entrega_conferencia_itens','production_order_link'")
STATE=STATE[:-1]+", 'storage_objects_schema',(SELECT jsonb_agg(jsonb_build_array(attname,format_type(atttypid,atttypmod),attnotnull) ORDER BY attname COLLATE \"C\") FROM pg_attribute WHERE attrelid='storage.objects'::regclass AND attnum>0 AND NOT attisdropped))"
def candidate():
 proof=ROOT/'scripts/delivery-proof-authz-20261030/candidate.sql.review'
 s=proof.read_text(); a=s.index('CREATE OR REPLACE FUNCTION platform_private.delivery_mutation_guard_20261030()');b=s.index('-- Payload validation:',a); barrier=s[a:b]
 anchor=" IF c.action='proof' THEN"
 branch=""" IF c.action='confirm' THEN
  v_org:=platform_private.delivery_confirm_actor_v1();
  IF TG_OP='UPDATE' AND c.mutation='confirm' AND c.organization_id=v_org AND NEW.id=c.target AND OLD.id=c.target
   AND NEW.organization_id=OLD.organization_id AND OLD.organization_id=v_org AND OLD.status::text IN ('separado','em_rota') AND NEW.status::text='entregue'
   AND NEW.confirmado_por=auth.uid() AND NEW.recebimento_confirmado_por=auth.uid()
   AND (to_jsonb(NEW)-ARRAY['status','entregue_em','recebido_por_nome','recebido_por_cargo','recebido_por_documento','observacoes_confirmacao','confirmado_por','recebimento_confirmado_em','recebimento_confirmado_por','comprovante_status','updated_at'])
    IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','entregue_em','recebido_por_nome','recebido_por_cargo','recebido_por_documento','observacoes_confirmacao','confirmado_por','recebimento_confirmado_em','recebimento_confirmado_por','comprovante_status','updated_at'])
  THEN UPDATE platform_private.delivery_context_20261030 SET mutation='done' WHERE txid=c.txid; RETURN NEW; END IF;
  RAISE EXCEPTION 'DELIVERY_CONFIRM_MUTATION_DENIED' USING ERRCODE='42501';
 END IF;
"""
 assert barrier.count(anchor)==1;barrier=barrier.replace(anchor,branch+anchor)
 meta=json.loads((ROOT/'scripts/delivery-atomic-hardening-20261030/capture/current.json').read_text())
 rows=[r for r in meta['functions'] if r['name']=='fn_validate_entrega_confirmacao'];assert len(rows)==1
 validator=rows[0]['body'];a=validator.index('      SELECT count(*)');b=validator.index('      IF v_anexos = 0',a)
 validator=validator[:a]+"      PERFORM platform_private.delivery_confirm_proof_v1(NEW);\n      v_anexos:=1;\n"+validator[b:]
 cap="""CREATE FUNCTION public.rpc_entrega_confirmacao_capability_v1(p_entrega uuid) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid; e public.entregas; available boolean:=false; BEGIN
 BEGIN org:=platform_private.delivery_confirm_actor_v1(); e:=platform_private.delivery_confirm_recheck_v1(p_entrega,org);
 available:=has_function_privilege('authenticated','public.rpc_entrega_confirmar_manual_v1(uuid,timestamptz,text,jsonb)','EXECUTE') AND e.status::text IN ('separado','em_rota','entregue');
 EXCEPTION WHEN insufficient_privilege THEN available:=false; END;
 RETURN jsonb_build_object('capability','delivery_confirmation_manual_v1','available',available,'actor_id',auth.uid(),'organization_id',org,'entrega_id',p_entrega,'updated_at',e.updated_at,'status',e.status::text);
END $$;
REVOKE ALL ON FUNCTION public.rpc_entrega_confirmacao_capability_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.rpc_entrega_confirmacao_capability_v1(uuid) TO authenticated;
"""
 return (H/'core.sql.review').read_text()+'\n'+barrier+'\n'+validator+';\n'+cap

def guard(x,name):return "DO $guard$ BEGIN IF ("+STATE+") IS DISTINCT FROM '"+json.dumps(x).replace("'","''")+"'::jsonb THEN RAISE EXCEPTION '"+name+"'; END IF; END $guard$;\n"
def write(pre,post,released):
 delta=candidate();grant=f'GRANT EXECUTE ON FUNCTION {RPC} TO authenticated;\n'
 for n,v in [('candidate',delta),('preflight',guard(pre,'CONFIRM_PRE_DRIFT')),('postflight',guard(post,'CONFIRM_POST_DRIFT')),('install','BEGIN; SET LOCAL lock_timeout=\'3s\';\n'+guard(pre,'CONFIRM_PRE_DRIFT')+delta+guard(post,'CONFIRM_POST_DRIFT')+'COMMIT;'),('release-preflight',guard(post,'CONFIRM_RELEASE_PRE_DRIFT')),('release-postflight',guard(released,'CONFIRM_RELEASE_POST_DRIFT')),('release','BEGIN;\n'+guard(post,'CONFIRM_RELEASE_PRE_DRIFT')+grant+guard(released,'CONFIRM_RELEASE_POST_DRIFT')+'COMMIT;'),('rollback',"BEGIN;\nDO $guard$ BEGIN IF ("+STATE+") NOT IN ('"+json.dumps(post).replace("'","''")+"'::jsonb,'"+json.dumps(released).replace("'","''")+"'::jsonb) THEN RAISE EXCEPTION 'CONFIRM_ROLLBACK_DRIFT'; END IF; END $guard$;\n"+f'REVOKE EXECUTE ON FUNCTION {RPC} FROM PUBLIC,anon,authenticated,service_role;\nCOMMIT;')]: (H/(n+'.sql.review')).write_text(v+'\n')
 (H/'state.sql.review').write_text(STATE+';\n')
 for n,x in [('pre-state',pre),('post-state',post),('released-state',released)]: (H/(n+'.json')).write_text(json.dumps(x,indent=2)+'\n')
