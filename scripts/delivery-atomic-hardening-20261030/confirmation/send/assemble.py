"""Local-only canonical send delta, composed after closed confirmation install."""
from pathlib import Path
import importlib.util,json
H=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('confirm',H.parent/'assemble.py');G=importlib.util.module_from_spec(spec);spec.loader.exec_module(G)
RPC='public.rpc_entrega_enviar_manual_v1(uuid,timestamptz,text)'
STATE=G.STATE[:-1]+",'send_functions',(SELECT jsonb_agg(jsonb_build_array(n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),md5(pg_get_functiondef(p.oid)),p.proacl::text,pg_get_userbyid(p.proowner)) ORDER BY n.nspname COLLATE \"C\",p.proname COLLATE \"C\") FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname LIKE 'delivery_send_%' OR p.proname IN ('rpc_entrega_enviar_manual_v1','rpc_entrega_envio_capability_v1')))"
def candidate():
 s=(H.parent/'core.sql.review').read_text();a=s.index('CREATE FUNCTION platform_private.delivery_confirm_apply_v1');b=s.index(' PERFORM 1 FROM public.entrega_comprovantes',a)
 prefix=s[a:b].replace('delivery_confirm_apply_v1(p_entrega uuid,p_observed timestamptz,p_key text,p_recebedor jsonb)','delivery_send_apply_v1(p_entrega uuid,p_observed timestamptz,p_key text)')
 a=prefix.index(" IF p_entrega IS NULL");b=prefix.index(' initial:=',a)
 prefix=prefix[:a]+" IF p_entrega IS NULL OR p_observed IS NULL OR NOT isfinite(p_observed) OR p_key IS NULL OR p_key !~ '^[A-Za-z0-9:_-]{8,128}$' THEN RAISE EXCEPTION 'DELIVERY_SEND_INVALID' USING ERRCODE='22023'; END IF;\n p:='{}';\n"+prefix[b:]
 prefix=prefix.replace("'delivery_confirm:'","'delivery_send:'").replace('DELIVERY_CONFIRM_','DELIVERY_SEND_')
 body=prefix+"""
 IF s.status::text<>'expedido' OR s.quantidade IS DISTINCT FROM e.quantidade_entregue OR s.quantidade_reservada IS DISTINCT FROM e.quantidade_entregue
 OR (SELECT count(*) FROM public.estoque_movimentacoes WHERE estoque_produto_id=s.id AND referencia_tipo='entrega' AND referencia_id=e.id AND acao='expedicao' AND os_id=e.ordem_servico_id AND os_tipo='manual' AND lote_id=l.id AND quantidade=e.quantidade_entregue)<>1
 OR EXISTS(SELECT 1 FROM public.estoque_movimentacoes WHERE estoque_produto_id=s.id AND referencia_id=e.id AND acao IN ('estorno_expedicao','entrega','devolucao'))
 OR NOT EXISTS(SELECT 1 FROM public.ordens_servico WHERE id=e.ordem_servico_id AND status::text='pronto_entrega') THEN RAISE EXCEPTION 'DELIVERY_SEND_STATE_DENIED' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.estoque_movimentacoes WHERE estoque_produto_id=s.id AND referencia_id=e.id ORDER BY id FOR SHARE;
 e:=platform_private.delivery_confirm_recheck_v1(p_entrega,org);
 SELECT * INTO prev FROM platform_private.delivery_requests_20261030 WHERE organization_id=org AND actor=v_actor AND action='send' AND request_key=p_key;
 IF FOUND THEN
  IF prev.fingerprint IS DISTINCT FROM fp OR e.status::text<>'em_rota' THEN RAISE EXCEPTION 'DELIVERY_SEND_REPLAY_CONFLICT' USING ERRCODE='PT409'; END IF;
  RETURN prev.result||jsonb_build_object('replay',true);
 END IF;
 IF e.status::text<>'separado' OR e.updated_at IS DISTINCT FROM p_observed THEN RAISE EXCEPTION 'DELIVERY_SEND_OBSERVED_CONFLICT' USING ERRCODE='PT409'; END IF;
 image:=to_jsonb(e)||jsonb_build_object('status','em_rota','updated_at',now());
 INSERT INTO platform_private.delivery_send_permits_v1 VALUES(txid_current(),v_actor,org,e.id,to_jsonb(e),image,false);
 INSERT INTO platform_private.delivery_context_20261030(txid,actor,organization_id,action,target,mutation) VALUES(txid_current(),v_actor,org,'send',e.id,'send');
 UPDATE public.entregas SET status='em_rota' WHERE id=e.id AND updated_at=p_observed RETURNING * INTO e;
 IF e.id IS NULL OR NOT EXISTS(SELECT 1 FROM platform_private.delivery_send_permits_v1 WHERE txid=txid_current() AND consumed) OR NOT EXISTS(SELECT 1 FROM platform_private.delivery_context_20261030 WHERE txid=txid_current() AND mutation='done') THEN RAISE EXCEPTION 'DELIVERY_SEND_PERMIT_UNUSED' USING ERRCODE='42501'; END IF;
 PERFORM platform_private.delivery_confirm_recheck_v1(p_entrega,org);
 result:=jsonb_build_object('success',true,'action','send','replay',false,'actor_id',v_actor,'organization_id',org,'entrega_id',e.id,'os_id',e.ordem_servico_id,'status','em_rota','updated_at',e.updated_at);
 INSERT INTO platform_private.delivery_requests_20261030(request_key,actor,organization_id,action,fingerprint,result) VALUES(p_key,v_actor,org,'send',fp,result);
 DELETE FROM platform_private.delivery_send_permits_v1 WHERE txid=txid_current();DELETE FROM platform_private.delivery_context_20261030 WHERE txid=txid_current();RETURN result;
 END $$;
 REVOKE ALL ON FUNCTION platform_private.delivery_send_apply_v1(uuid,timestamptz,text) FROM PUBLIC,anon,authenticated,service_role;
 CREATE FUNCTION public.rpc_entrega_enviar_manual_v1(p_entrega uuid,p_observed timestamptz,p_request_key text) RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$ SELECT platform_private.delivery_send_apply_v1(p_entrega,p_observed,p_request_key) $$;
 REVOKE ALL ON FUNCTION public.rpc_entrega_enviar_manual_v1(uuid,timestamptz,text) FROM PUBLIC,anon,authenticated,service_role;
 CREATE FUNCTION public.rpc_entrega_envio_capability_v1(p_entrega uuid) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 DECLARE org uuid;e public.entregas;available boolean:=false;BEGIN
 BEGIN org:=platform_private.delivery_confirm_actor_v1();e:=platform_private.delivery_confirm_recheck_v1(p_entrega,org);available:=has_function_privilege('authenticated','public.rpc_entrega_enviar_manual_v1(uuid,timestamptz,text)','EXECUTE') AND e.status::text IN ('separado','em_rota');EXCEPTION WHEN insufficient_privilege THEN available:=false;END;
 RETURN jsonb_build_object('capability','delivery_send_manual_v1','available',available,'actor_id',auth.uid(),'organization_id',org,'entrega_id',p_entrega,'os_id',e.ordem_servico_id,'status',e.status::text,'updated_at',e.updated_at);END $$;
 REVOKE ALL ON FUNCTION public.rpc_entrega_envio_capability_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
 GRANT EXECUTE ON FUNCTION public.rpc_entrega_envio_capability_v1(uuid) TO authenticated;
 """
 barrier=G.candidate();a=barrier.index('CREATE OR REPLACE FUNCTION platform_private.delivery_mutation_guard_20261030()');b=barrier.index('\nCREATE OR REPLACE FUNCTION public.fn_validate_entrega_confirmacao',a)
 barrier=barrier[a:b];anchor=" IF c.action='confirm' THEN";assert barrier.count(anchor)==1
 branch=""" IF c.action='send' THEN
  v_org:=platform_private.delivery_confirm_actor_v1();
  IF TG_OP='UPDATE' AND c.mutation='send' AND c.organization_id=v_org AND OLD.organization_id=v_org AND OLD.id=c.target AND NEW.id=c.target AND OLD.status::text='separado' AND NEW.status::text='em_rota' AND (to_jsonb(NEW)-ARRAY['status','updated_at'])=(to_jsonb(OLD)-ARRAY['status','updated_at']) THEN UPDATE platform_private.delivery_context_20261030 SET mutation='done' WHERE txid=c.txid;RETURN NEW;END IF;
  RAISE EXCEPTION 'DELIVERY_SEND_MUTATION_DENIED' USING ERRCODE='42501';
 END IF;
 """
 permits="""CREATE TABLE platform_private.delivery_send_permits_v1(txid bigint PRIMARY KEY,actor uuid NOT NULL,organization_id uuid NOT NULL,target uuid NOT NULL,old_image jsonb NOT NULL,new_image jsonb NOT NULL,consumed boolean NOT NULL DEFAULT false);
 REVOKE ALL ON platform_private.delivery_send_permits_v1 FROM PUBLIC,anon,authenticated,service_role;ALTER TABLE platform_private.delivery_send_permits_v1 ENABLE ROW LEVEL SECURITY;
 CREATE FUNCTION platform_private.delivery_send_exact_guard_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE p platform_private.delivery_send_permits_v1;org uuid;BEGIN
 IF NOT EXISTS(SELECT 1 FROM platform_private.delivery_context_20261030 WHERE txid=txid_current() AND action='send') THEN RETURN NEW;END IF;
 org:=platform_private.delivery_confirm_actor_v1();SELECT * INTO p FROM platform_private.delivery_send_permits_v1 WHERE txid=txid_current() AND actor=auth.uid() AND organization_id=org;
 IF NOT FOUND OR p.consumed OR TG_OP<>'UPDATE' OR NEW.id<>p.target OR to_jsonb(OLD)<>p.old_image OR to_jsonb(NEW)<>p.new_image THEN RAISE EXCEPTION 'DELIVERY_SEND_EXACT_IMAGE_DENIED' USING ERRCODE='42501';END IF;
 UPDATE platform_private.delivery_send_permits_v1 SET consumed=true WHERE txid=p.txid;RETURN NEW;END $$;
 REVOKE ALL ON FUNCTION platform_private.delivery_send_exact_guard_v1() FROM PUBLIC,anon,authenticated,service_role;
 CREATE TRIGGER zzzzz_send_exact AFTER INSERT OR UPDATE ON public.entregas FOR EACH ROW EXECUTE FUNCTION platform_private.delivery_send_exact_guard_v1();
 """
 return permits+body+barrier.replace(anchor,branch+anchor)
def write(pre,post):
 guard=lambda s,n:"DO $guard$ BEGIN IF ("+STATE+") IS DISTINCT FROM '"+json.dumps(s).replace("'","''")+"'::jsonb THEN RAISE EXCEPTION '"+n+"';END IF;END $guard$;\n"
 for name,text in [('candidate',candidate()),('preflight',guard(pre,'SEND_PRE_DRIFT')),('postflight',guard(post,'SEND_POST_DRIFT')),('install','BEGIN;\n'+guard(pre,'SEND_PRE_DRIFT')+candidate()+guard(post,'SEND_POST_DRIFT')+'COMMIT;'),('release',"DO $closed$ BEGIN RAISE EXCEPTION 'SEND_RELEASE_NO_GO_INDEPENDENT_REVIEW';END $closed$;"),('rollback',f'BEGIN;REVOKE EXECUTE ON FUNCTION {RPC} FROM PUBLIC,anon,authenticated,service_role;COMMIT;')]: (H/(name+'.sql.review')).write_text(text+'\n')
 for name,data in [('pre-state',pre),('post-state',post)]: (H/(name+'.json')).write_text(json.dumps(data,indent=2)+'\n')