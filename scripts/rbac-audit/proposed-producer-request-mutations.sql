-- CANDIDATO REVISÁVEL. Somente swzpzcwiasxmjutrmvkm. NÃO APLICADO.
-- Executar preflight-producer-request-mutations.sql na MESMA transação antes deste corpo.
-- Preserva policies, grants, cinco triggers/corpos; sem backfill/dados ou desabilitar notificações.
CREATE FUNCTION public.producer_request_mutation_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_actor uuid := auth.uid(); v_org uuid;
BEGIN
 -- Não concede acesso: internos continuam sujeitos às policies existentes.
 IF NOT platform_private.has_role(v_actor,'cliente_produtor'::public.app_role) THEN RETURN NEW; END IF;
 IF NOT public.technical_actor_ready(v_actor)
 OR NOT public.technical_refs_in_actor_tenant(NEW.cliente_id,NEW.fazenda_id,NEW.talhao_id)
 OR NOT (NEW.cliente_id = ANY(public.get_cliente_ids_for_user(v_actor)))
 OR NOT EXISTS (SELECT 1 FROM public.clientes c WHERE c.id=NEW.cliente_id AND c.status_cliente::text='ativo') THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PRODUCER_REQUEST_SCOPE_DENIED';
 END IF;
 IF TG_OP='INSERT' THEN
   IF NEW.user_id IS DISTINCT FROM v_actor
   OR (NEW.created_by IS NOT NULL AND NEW.created_by IS DISTINCT FROM v_actor)
   OR NEW.status IS DISTINCT FROM 'pendente'
   OR NEW.origem_solicitacao IS DISTINCT FROM 'portal_produtor'
   OR NEW.consultor_atribuido IS NOT NULL OR NEW.tipo_demanda='retorno_tecnico'
   OR NEW.data_prevista_atendimento IS NOT NULL OR NEW.duracao_estimada IS NOT NULL
   OR NEW.registro_origem_id IS NOT NULL OR NEW.external_event_id IS NOT NULL
   OR NEW.confirmacao_produtor IS DISTINCT FROM 'pendente'
   OR NULLIF(NEW.numero_solicitacao,'') IS NOT NULL THEN
     RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PRODUCER_REQUEST_FIELDS_DENIED';
   END IF;
   NEW.created_by := v_actor;
   NEW.created_at := statement_timestamp(); NEW.updated_at := NEW.created_at;
   RETURN NEW;
 END IF;
 -- UPDATE atual do portal é somente resposta à agenda; protege também campos futuros.
 IF (to_jsonb(NEW)-ARRAY['confirmacao_produtor','updated_at']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['confirmacao_produtor','updated_at'])
 OR OLD.tipo_demanda IS DISTINCT FROM 'retorno_tecnico'
 OR OLD.status IS NULL OR OLD.status IN ('concluida','cancelada')
 OR NEW.confirmacao_produtor IS NULL
 OR NEW.confirmacao_produtor NOT IN ('confirmada','remarcacao_solicitada') THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PRODUCER_REQUEST_UPDATE_DENIED';
 END IF;
 -- Não notificar atribuições históricas estrangeiras/inativas ou sem carteira comprovada.
 v_org := platform_private.h15_actor_organization();
 IF NOT EXISTS (
   SELECT 1 FROM public.profiles p WHERE p.user_id=OLD.consultor_atribuido
   AND p.organization_id=v_org AND p.ativo IS TRUE
   AND (platform_private.has_role(p.user_id,'administrador'::public.app_role)
     OR platform_private.has_role(p.user_id,'gestor'::public.app_role)
     OR ((platform_private.has_role(p.user_id,'consultor_tecnico'::public.app_role)
       OR platform_private.has_role(p.user_id,'tecnico_agronomo'::public.app_role))
       AND EXISTS (SELECT 1 FROM public.user_clientes uc WHERE uc.user_id=p.user_id
       AND uc.cliente_id=OLD.cliente_id AND uc.is_active IS TRUE AND uc.revoked_at IS NULL
       AND (uc.valid_from IS NULL OR uc.valid_from<=now())
       AND (uc.valid_until IS NULL OR uc.valid_until>=now())
       AND uc.access_level::text IN ('read','execute','manage'))))
 ) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PRODUCER_REQUEST_RECIPIENT_DENIED'; END IF;
 NEW.updated_at := statement_timestamp();
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.producer_request_mutation_guard() FROM PUBLIC,anon,authenticated,service_role;
-- Antes de gen_numero, validação agenda e TODOS os efeitos AFTER.
CREATE TRIGGER a00_producer_request_mutation_guard BEFORE INSERT OR UPDATE ON public.portal_solicitacoes
FOR EACH ROW EXECUTE FUNCTION public.producer_request_mutation_guard();