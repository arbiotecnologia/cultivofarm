CREATE OR REPLACE FUNCTION platform_private.notification_source_org(st text,sid uuid) RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ DECLARE v uuid; BEGIN
 IF sid IS NULL THEN RETURN NULL; END IF;
 CASE st
 WHEN 'registros_consultor','registro_consultor','monitoramento_vencido' THEN SELECT c.organization_id INTO v FROM public.registros_consultor r JOIN public.clientes c ON c.id=r.cliente_id WHERE r.id=sid;
 WHEN 'ordem_servico','ordens_servico' THEN SELECT o.organization_id INTO v FROM public.ordens_servico o JOIN public.clientes c ON c.id=o.cliente_id AND c.organization_id=o.organization_id WHERE o.id=sid;
 WHEN 'portal_solicitacoes' THEN SELECT c.organization_id INTO v FROM public.portal_solicitacoes s JOIN public.clientes c ON c.id=s.cliente_id WHERE s.id=sid;
 WHEN 'programacao_producao' THEN SELECT p.organization_id INTO v FROM public.programacao_producao p WHERE p.id=sid AND ((p.ordem_servico_id IS NOT NULL AND p.ordem_servico_onfarm_id IS NULL AND EXISTS(SELECT 1 FROM public.ordens_servico o JOIN public.clientes c ON c.id=o.cliente_id AND c.organization_id=o.organization_id WHERE o.id=p.ordem_servico_id AND o.organization_id=p.organization_id)) OR (p.ordem_servico_onfarm_id IS NOT NULL AND p.ordem_servico_id IS NULL AND EXISTS(SELECT 1 FROM public.ordens_servico_onfarm o JOIN public.clientes c ON c.id=o.cliente_id WHERE o.id=p.ordem_servico_onfarm_id AND c.organization_id=p.organization_id)));
 WHEN 'estoque_produto' THEN SELECT l.organization_id INTO v FROM public.estoque_produto e JOIN public.lotes l ON l.id=e.lote_id WHERE e.id=sid;
 WHEN 'aplicacao','aplicacoes' THEN SELECT a.organization_id INTO v FROM public.aplicacoes a JOIN public.ordens_servico o ON o.id=a.ordem_servico_id AND o.organization_id=a.organization_id JOIN public.clientes c ON c.id=o.cliente_id AND c.organization_id=o.organization_id WHERE a.id=sid AND a.ordem_servico_onfarm_id IS NULL;
 WHEN 'partner_orders' THEN SELECT c.organization_id INTO v FROM public.partner_orders o JOIN public.partner_accounts p ON p.id=o.partner_id AND p.ativo IS TRUE AND p.deleted_at IS NULL JOIN public.clientes c ON c.id=p.client_id WHERE o.id=sid;
 WHEN 'partner_simulations' THEN SELECT c.organization_id INTO v FROM public.partner_simulations s JOIN public.partner_accounts p ON p.id=s.partner_id AND p.ativo IS TRUE AND p.deleted_at IS NULL JOIN public.clientes c ON c.id=p.client_id WHERE s.id=sid;
 ELSE RETURN NULL; END CASE;
 IF NOT EXISTS(SELECT 1 FROM public.organizations o WHERE o.id=v AND o.ativo IS TRUE) THEN RETURN NULL; END IF;
 RETURN v; END $$;
REVOKE ALL ON FUNCTION platform_private.notification_source_org(text,uuid) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION platform_private.notification_source_org(text,uuid) TO service_role;
CREATE OR REPLACE FUNCTION platform_private.notification_user_ok(uid uuid,org uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT org IS NOT NULL AND public.h15_user_organization(uid)=org AND platform_private.platform_actor_access_ready(uid); $$;
REVOKE ALL ON FUNCTION platform_private.notification_user_ok(uuid,uuid) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION platform_private.notification_user_ok(uuid,uuid) TO service_role;
ALTER TABLE public.portal_notificacoes ADD COLUMN IF NOT EXISTS recipient_user_id uuid;
CREATE OR REPLACE FUNCTION public.notification_p1_visible(uid uuid,st text,sid uuid,cid uuid DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ DECLARE org uuid; BEGIN
 org:=platform_private.notification_source_org(st,sid);
 IF uid IS DISTINCT FROM auth.uid() OR NOT COALESCE(platform_private.notification_user_ok(uid,org),false) OR public.h15_actor_organization() IS DISTINCT FROM org THEN RETURN false; END IF;
 IF cid IS NOT NULL THEN
  RETURN public.has_role(uid,'cliente_produtor') AND EXISTS(SELECT 1 FROM public.clientes c WHERE c.id=cid AND c.organization_id=org) AND public._portal_cliente_user_has_link(uid,cid);
 END IF;
 RETURN true; END $$;
REVOKE ALL ON FUNCTION public.notification_p1_visible(uuid,text,uuid,uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.notification_p1_visible(uuid,text,uuid,uuid) TO authenticated,service_role;
CREATE POLICY notification_p1_op_isolation ON public.notificacoes_operacionais AS RESTRICTIVE FOR ALL TO authenticated USING(public.notification_p1_visible(usuario_id,source_type,source_id)) WITH CHECK(public.notification_p1_visible(usuario_id,source_type,source_id));
CREATE POLICY notification_p1_portal_isolation ON public.portal_notificacoes AS RESTRICTIVE FOR ALL TO authenticated USING(public.notification_p1_visible(recipient_user_id,source_type,source_id,cliente_id)) WITH CHECK(public.notification_p1_visible(recipient_user_id,source_type,source_id,cliente_id));
REVOKE UPDATE ON public.notificacoes_operacionais,public.portal_notificacoes FROM authenticated;
GRANT UPDATE(lido) ON public.notificacoes_operacionais,public.portal_notificacoes TO authenticated;
CREATE OR REPLACE FUNCTION platform_private.notification_p1_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE org uuid; uid uuid; cid uuid; BEGIN
 IF TG_OP='UPDATE' THEN
  IF (to_jsonb(NEW)-'lido') IS DISTINCT FROM (to_jsonb(OLD)-'lido') THEN RAISE EXCEPTION 'NOTIF_CONTENT_IMMUTABLE' USING ERRCODE='42501'; END IF;
  RETURN NEW;
 END IF;
 -- Unknown source is quarantined, not attributed from recipient or message/link. Preserve parent operations.
 IF NEW.source_type IS NULL OR NEW.source_id IS NULL THEN RETURN NULL; END IF;
 org:=platform_private.notification_source_org(NEW.source_type,NEW.source_id);
 IF TG_TABLE_NAME='notificacoes_operacionais' THEN uid:=NEW.usuario_id; ELSE uid:=NEW.recipient_user_id; cid:=NEW.cliente_id; END IF;
 IF NOT COALESCE(platform_private.notification_user_ok(uid,org),false) THEN RAISE EXCEPTION 'NOTIF_SOURCE_RECIPIENT_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF cid IS NOT NULL AND (NOT public.has_role(uid,'cliente_produtor') OR NOT public._portal_cliente_user_has_link(uid,cid) OR NOT EXISTS(SELECT 1 FROM public.clientes c WHERE c.id=cid AND c.organization_id=org)) THEN RAISE EXCEPTION 'NOTIF_PORTAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NEW.tipo::text='sistema' THEN RAISE EXCEPTION 'NOTIF_GLOBAL_PRODUCER_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN NEW; END $$;
REVOKE ALL ON FUNCTION platform_private.notification_p1_guard() FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION platform_private.notification_p1_guard() TO service_role;
CREATE TRIGGER notification_p1_guard BEFORE INSERT OR UPDATE ON public.notificacoes_operacionais FOR EACH ROW EXECUTE FUNCTION platform_private.notification_p1_guard();
CREATE TRIGGER notification_p1_guard BEFORE INSERT OR UPDATE ON public.portal_notificacoes FOR EACH ROW EXECUTE FUNCTION platform_private.notification_p1_guard();
-- External alert routes have no deterministic source/recipient contract yet: fail closed, no queues or dispatch.
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['alertas_notificacao_config','alertas_notificacao_destinatarios','alertas_notificacoes','alertas_resumos'] LOOP EXECUTE format('CREATE POLICY notification_p1_external_containment ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING(false) WITH CHECK(false)',t); END LOOP; END $$;
CREATE OR REPLACE FUNCTION platform_private.notification_external_block() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'NOTIF_EXTERNAL_DELIVERY_DISABLED' USING ERRCODE='42501'; END $$;
REVOKE ALL ON FUNCTION platform_private.notification_external_block() FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION platform_private.notification_external_block() TO service_role;
CREATE TRIGGER notification_p1_no_queue BEFORE INSERT OR UPDATE ON public.alertas_notificacoes FOR EACH ROW EXECUTE FUNCTION platform_private.notification_external_block();
CREATE TRIGGER notification_p1_no_queue BEFORE INSERT OR UPDATE ON public.alertas_resumos FOR EACH ROW EXECUTE FUNCTION platform_private.notification_external_block();
CREATE OR REPLACE FUNCTION public.rpc_preparar_notificacoes_alertas() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'NOTIF_EXTERNAL_DELIVERY_DISABLED' USING ERRCODE='42501'; END $$;
REVOKE ALL ON FUNCTION public.rpc_preparar_notificacoes_alertas() FROM PUBLIC,anon,authenticated;
CREATE POLICY notification_p1_push_active ON public.push_subscriptions AS RESTRICTIVE FOR ALL TO authenticated USING(user_id=auth.uid() AND public.h15_actor_organization() IS NOT NULL) WITH CHECK(user_id=auth.uid() AND public.h15_actor_organization() IS NOT NULL);
-- Source-less privileged writers cannot synthesize global messages.
REVOKE ALL ON FUNCTION public._notify_role(public.app_role,text,text,text,text), public.rpc_notificar_gestor(text,text,text),public.rpc_create_operational_notification_secure(uuid,text,text,text,text),public.rpc_create_portal_notification_secure(uuid,text,text,text),public.rpc_dispatch_inapp_notification(uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
