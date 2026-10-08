DO $$ DECLARE d text; BEGIN
 SELECT pg_get_functiondef('public.rpc_create_notificacao_operacional(uuid,text,text,text,text,text,uuid,text)'::regprocedure) INTO d;
 d:=replace(d,'BEGIN'||chr(10)||'  IF _usuario_id', 'BEGIN'||chr(10)||$guard$
  IF auth.uid() IS NULL OR public.h15_actor_organization() IS NULL
   OR public.h15_actor_organization() IS DISTINCT FROM platform_private.notification_source_org(lower(coalesce(_source_type,'')),_source_id)
   OR NOT COALESCE(platform_private.notification_user_ok(_usuario_id,public.h15_actor_organization()),false)
   OR _tipo = 'sistema' THEN RAISE EXCEPTION 'NOTIF_SOURCE_RECIPIENT_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF _idempotency_key IS NOT NULL THEN
   IF length(_idempotency_key) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'NOTIF_INVALID_KEY' USING ERRCODE='22023'; END IF;
   _idempotency_key := 'np1:'||md5(jsonb_build_array(public.h15_actor_organization(),auth.uid(),_usuario_id,_source_type,_source_id,_idempotency_key)::text);
   PERFORM pg_advisory_xact_lock(hashtextextended(_idempotency_key,0));
   IF EXISTS(SELECT 1 FROM public.notificacoes_operacionais n WHERE n.idempotency_key=_idempotency_key AND (n.usuario_id IS DISTINCT FROM _usuario_id OR n.source_type IS DISTINCT FROM _source_type OR n.source_id IS DISTINCT FROM _source_id OR n.tipo IS DISTINCT FROM _tipo OR n.titulo IS DISTINCT FROM _titulo OR n.mensagem IS DISTINCT FROM _mensagem OR n.link IS DISTINCT FROM _link)) THEN RAISE EXCEPTION 'NOTIF_REPLAY_CONFLICT' USING ERRCODE='22023'; END IF;
  END IF;
  IF _usuario_id$guard$);
 IF position('NOTIF_REPLAY_CONFLICT' in d)=0 THEN RAISE EXCEPTION 'BASELINE_MISMATCH'; END IF; EXECUTE d;
 END $$;
-- Portal API cannot claim individualized delivery with its old client-wide contract. Closed pending fanout proof.
REVOKE ALL ON FUNCTION public.rpc_create_portal_notification_secure(uuid,text,text,text,text,text,uuid,text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.fn_notify_lab_on_programacao() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE org uuid; prod text; cli text; BEGIN
 IF NEW.status::text<>'aguardando' THEN RETURN NEW; END IF;
 org:=platform_private.notification_source_org('programacao_producao',NEW.id);
 IF org IS NULL THEN RETURN NEW; END IF;
 SELECT nome INTO prod FROM public.produtos WHERE id=NEW.produto_id;
 SELECT c.nome INTO cli FROM public.ordens_servico o JOIN public.clientes c ON c.id=o.cliente_id AND c.organization_id=org WHERE o.id=NEW.ordem_servico_id;
 INSERT INTO public.notificacoes_operacionais(usuario_id,tipo,titulo,mensagem,link,source_type,source_id)
 SELECT DISTINCT ur.user_id,'nova_demanda_producao','Nova demanda de produção',coalesce(prod,'Bioinsumo')||coalesce(' · '||cli,'')||coalesce(' · '||round(NEW.volume_necessario/1000.0,1)::text||' L',''),'/pcp?coluna=aguardando','programacao_producao',NEW.id
 FROM public.user_roles ur WHERE ur.role IN ('producao','administrador','gestor') AND platform_private.notification_user_ok(ur.user_id,org);
 RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.fn_notify_lab_on_programacao() FROM PUBLIC,anon,authenticated;
-- Source-less role broadcast has no legitimate origin; suppress only notices, not parent B2B transactions.
CREATE OR REPLACE FUNCTION public._notify_role(p_role public.app_role,p_tipo text,p_titulo text,p_mensagem text,p_link text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN RETURN; END $$;
REVOKE ALL ON FUNCTION public._notify_role(public.app_role,text,text,text,text) FROM PUBLIC,anon,authenticated;
-- Source-less manager RPC must report containment, never success or cross-tenant replay.
CREATE OR REPLACE FUNCTION public.rpc_notificar_gestor(p_titulo text,p_mensagem text,p_link text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'NOTIF_SOURCE_REQUIRED' USING ERRCODE='42501'; END $$;
REVOKE ALL ON FUNCTION public.rpc_notificar_gestor(text,text,text) FROM PUBLIC,anon,authenticated;
-- Monitor endpoint reads a resource before scoping; close until its separate contract is proven.
REVOKE ALL ON FUNCTION public.rpc_check_monitoramento_and_notify(uuid) FROM PUBLIC,anon,authenticated;
