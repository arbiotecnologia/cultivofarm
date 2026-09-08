-- H9-D-L2 — Correção de exposições comprovadas no lote L2
-- Ambiente: homologação ikaauvsflpmamgxmkhoq. Produção NÃO tocada.
--
-- Exposições comprovadas dinamicamente (usuário authenticated sem papel e sem vínculo):
--  (E1) get_cliente_id_for_user(uuid) devolvia o cliente_id de QUALQUER usuário
--       informado por parâmetro (vazamento de tenant / BOLA).
--  (E2) helpers de papel com uid parametrizado (can_manage_catalog_tecnico,
--       can_view_catalog_internal, can_manage_technical_visit,
--       can_view_technical_visit, fn_fiscal_can_operate,
--       fn_fiscal_can_read_internal, fn_regulatory_can_approve,
--       fn_regulatory_can_prepare, fn_regulatory_can_read) respondiam sobre uid
--       de TERCEIROS, funcionando como oráculo de papéis; além disso qualquer
--       chamador que controle o argumento (ex.: rpc_fiscal_event_sefaz_prepare_v1,
--       que confia em `_actor`) poderia satisfazer a guarda com o uid de um
--       administrador.
--  (E3) fn_microorganism_regulatory_facts(uuid) e fn_fiscal_company_crt()
--       devolviam dados regulatórios/fiscais internos a qualquer authenticated,
--       contornando as políticas que protegem as tabelas de origem
--       (fn_regulatory_can_read / fn_fiscal_can_read_internal).
--
-- Correção mínima, sem fluxo paralelo: assinaturas, parâmetros, defaults,
-- retornos e semântica legítima preservados. Todos os callsites reais passam
-- auth.uid() (políticas RLS, RPCs e views), portanto não são afetados; sessões
-- internas sem JWT (pg_cron/service_role, auth.uid() IS NULL) continuam válidas.

-- Helper de escopo de identidade: self, admin ou sessão interna sem JWT.
CREATE OR REPLACE FUNCTION public.fn_authz_uid_scope_ok(_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT auth.uid() IS NULL
      OR (_uid IS NOT NULL AND _uid = auth.uid())
      OR public.has_role(auth.uid(), 'administrador'::app_role);
$function$;

REVOKE ALL ON FUNCTION public.fn_authz_uid_scope_ok(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_authz_uid_scope_ok(uuid) TO authenticated, service_role;

-- E2 — helpers de papel/visita com uid parametrizado
CREATE OR REPLACE FUNCTION public.can_manage_catalog_tecnico(_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.fn_authz_uid_scope_ok(_uid)
     AND (public.has_role(_uid,'administrador')
      OR public.has_role(_uid,'gestor')
      OR public.has_role(_uid,'consultor_tecnico')
      OR public.has_role(_uid,'tecnico_agronomo'));
$function$;

CREATE OR REPLACE FUNCTION public.can_view_catalog_internal(_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.fn_authz_uid_scope_ok(_uid)
     AND (public.has_role(_uid,'administrador')
      OR public.has_role(_uid,'gestor')
      OR public.has_role(_uid,'consultor_tecnico')
      OR public.has_role(_uid,'tecnico_agronomo')
      OR public.has_role(_uid,'gestor_comercial')
      OR public.has_role(_uid,'operador_onfarm')
      OR public.has_role(_uid,'producao')
      OR public.has_role(_uid,'administrativo')
      OR public.has_role(_uid,'financeiro'));
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_technical_visit(p_user_id uuid, p_registro_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.fn_authz_uid_scope_ok(p_user_id)
     AND (
       public.has_role(p_user_id, 'administrador')
       OR public.is_visit_responsible(p_user_id, p_registro_id)
       OR public.is_visit_org_manager(p_user_id, p_registro_id)
     )
$function$;

CREATE OR REPLACE FUNCTION public.can_view_technical_visit(p_user_id uuid, p_registro_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.fn_authz_uid_scope_ok(p_user_id)
     AND (
       public.has_role(p_user_id, 'administrador')
       OR public.is_visit_responsible(p_user_id, p_registro_id)
       OR public.is_active_visit_participant(p_user_id, p_registro_id)
       OR public.is_visit_org_manager(p_user_id, p_registro_id)
     )
$function$;

CREATE OR REPLACE FUNCTION public.fn_fiscal_can_operate(_uid uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT _uid IS NOT NULL AND public.fn_authz_uid_scope_ok(_uid) AND (
    public.has_role(_uid,'administrador'::app_role)
    OR public.has_role(_uid,'gestor'::app_role)
    OR public.has_role(_uid,'financeiro'::app_role));
$function$;

CREATE OR REPLACE FUNCTION public.fn_fiscal_can_read_internal(_uid uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT _uid IS NOT NULL AND public.fn_authz_uid_scope_ok(_uid) AND (
    public.has_role(_uid,'administrador'::app_role)
    OR public.has_role(_uid,'gestor'::app_role)
    OR public.has_role(_uid,'financeiro'::app_role));
$function$;

CREATE OR REPLACE FUNCTION public.fn_regulatory_can_approve(_layer text, _uid uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT _uid IS NOT NULL AND public.fn_authz_uid_scope_ok(_uid) AND CASE _layer
    WHEN 'FISCAL' THEN public.has_role(_uid,'financeiro'::app_role)
                     OR public.has_role(_uid,'administrador'::app_role)
    WHEN 'REGULATORY' THEN public.has_role(_uid,'tecnico_agronomo'::app_role)
                        OR public.has_role(_uid,'administrador'::app_role)
    WHEN 'TECHNICAL' THEN public.has_role(_uid,'tecnico_agronomo'::app_role)
                       OR public.has_role(_uid,'administrador'::app_role)
    ELSE false END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_regulatory_can_prepare(_uid uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT _uid IS NOT NULL AND public.fn_authz_uid_scope_ok(_uid) AND (
    public.has_role(_uid,'administrador'::app_role)
    OR public.has_role(_uid,'gestor'::app_role));
$function$;

CREATE OR REPLACE FUNCTION public.fn_regulatory_can_read(_uid uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT _uid IS NOT NULL AND public.fn_authz_uid_scope_ok(_uid) AND (
    public.has_role(_uid,'administrador'::app_role)
    OR public.has_role(_uid,'gestor'::app_role)
    OR public.has_role(_uid,'financeiro'::app_role)
    OR public.has_role(_uid,'tecnico_agronomo'::app_role));
$function$;

-- E1 — vazamento de tenant por uid de terceiro
CREATE OR REPLACE FUNCTION public.get_cliente_id_for_user(_user_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN NOT public.fn_authz_uid_scope_ok(_user_id) THEN NULL::uuid ELSE (
    SELECT uc.cliente_id
      FROM public.user_clientes uc
     WHERE uc.user_id = _user_id
     ORDER BY uc.principal DESC, uc.created_at ASC
     LIMIT 1
  ) END
$function$;

-- E3 — leituras internas regulatórias/fiscais sem guarda
CREATE OR REPLACE FUNCTION public.fn_fiscal_company_crt()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE WHEN NOT (
      auth.uid() IS NULL
      OR public.fn_fiscal_can_read_internal(auth.uid())
      OR public.can_view_catalog_internal(auth.uid())
    ) THEN NULL::text ELSE (
    SELECT nullif(btrim(coalesce(c.crt,'')),'')
      FROM public.company_fiscal_settings c
     WHERE c.is_active = true
     ORDER BY c.updated_at DESC NULLS LAST
     LIMIT 1
  ) END
$function$;

CREATE OR REPLACE FUNCTION public.fn_microorganism_regulatory_facts(p_microorganism_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH g AS (
    SELECT (auth.uid() IS NULL
            OR public.fn_regulatory_can_read(auth.uid())
            OR public.fn_fiscal_can_read_internal(auth.uid())
            OR public.can_view_catalog_internal(auth.uid())) AS ok
  ), d AS (
    SELECT * FROM public.microorganism_regulatory_dossiers
     WHERE microorganism_id = p_microorganism_id AND deleted_at IS NULL
       AND (SELECT ok FROM g)
     ORDER BY (status='VALIDATED') DESC, version DESC
     LIMIT 1)
  SELECT CASE WHEN NOT (SELECT ok FROM g) THEN NULL
              WHEN NOT EXISTS (SELECT 1 FROM d) THEN NULL ELSE (
    SELECT jsonb_build_object(
      'dossier_id', d.id,
      'version', d.version,
      'status', d.status,
      'blocked_reason', d.blocked_reason,
      'regulatory_category', d.regulatory_category,
      'strain', coalesce(nullif(btrim(coalesce(d.strain_code,'')),''), nullif(btrim(coalesce(d.strain_name,'')),'')),
      'formulation', nullif(btrim(coalesce(d.formulation,'')),''),
      'label_guarantee', nullif(btrim(coalesce(d.label_guarantee,'')),''),
      'mapa_status', d.mapa_status,
      'mapa_registration_number', nullif(btrim(coalesce(d.mapa_registration_number,'')),''),
      'mapa_holder', nullif(btrim(coalesce(d.mapa_holder,'')),''),
      'mapa_valid_until', d.mapa_valid_until,
      'mapa_not_applicable_reason', nullif(btrim(coalesce(d.mapa_not_applicable_reason,'')),''),
      'published_ncm', d.published_ncm,
      'published_cest', d.published_cest,
      'effective_from', d.effective_from,
      'effective_to', d.effective_to,
      'review_technical', d.technical_review_status,
      'review_regulatory', d.regulatory_review_status,
      'review_fiscal', d.fiscal_review_status,
      'has_label_document', EXISTS (SELECT 1 FROM public.microorganism_regulatory_documents x
                                     WHERE x.dossier_id=d.id AND x.deleted_at IS NULL AND x.doc_type='ROTULO'),
      'has_report_document', EXISTS (SELECT 1 FROM public.microorganism_regulatory_documents x
                                     WHERE x.dossier_id=d.id AND x.deleted_at IS NULL AND x.doc_type IN ('LAUDO','CERTIFICADO_ANALISE')),
      'expired_documents', (SELECT count(*) FROM public.microorganism_regulatory_documents x
                             WHERE x.dossier_id=d.id AND x.deleted_at IS NULL
                               AND x.valid_until IS NOT NULL AND x.valid_until < current_date),
      'ncm_approved', EXISTS (SELECT 1 FROM public.microorganism_ncm_candidates c
                               WHERE c.dossier_id=d.id AND c.status='APPROVED'),
      'ncm_candidates', (SELECT count(*) FROM public.microorganism_ncm_candidates c WHERE c.dossier_id=d.id),
      'checklist_total', (SELECT count(*) FROM public.microorganism_regulatory_checklist c WHERE c.dossier_id=d.id),
      'checklist_pending', coalesce((SELECT jsonb_agg(c.item_key ORDER BY c.item_key)
                                      FROM public.microorganism_regulatory_checklist c
                                      WHERE c.dossier_id=d.id AND c.state='PENDING'),'[]'::jsonb),
      'checklist_not_applicable', coalesce((SELECT jsonb_agg(jsonb_build_object(
                                      'item_key',c.item_key,'justification',c.justification) ORDER BY c.item_key)
                                      FROM public.microorganism_regulatory_checklist c
                                      WHERE c.dossier_id=d.id AND c.state='NOT_APPLICABLE'),'[]'::jsonb),
      'checklist_confirmed', (SELECT count(*) FROM public.microorganism_regulatory_checklist c
                               WHERE c.dossier_id=d.id AND c.state='CONFIRMED'),
      'presentations_total', (SELECT count(*) FROM public.microorganism_regulatory_presentations p WHERE p.dossier_id=d.id),
      'presentations_units_unconfirmed', (SELECT count(*) FROM public.microorganism_regulatory_presentations p
                                           WHERE p.dossier_id=d.id AND NOT p.units_confirmed),
      'presentations_gtin_unconfirmed', (SELECT count(*) FROM public.microorganism_regulatory_presentations p
                                          WHERE p.dossier_id=d.id AND NOT p.gtin_confirmed))
    FROM d) END;
$function$;

-- ACL explícita preservada (sem PUBLIC/anon) para todas as funções alteradas.
DO $do$
DECLARE s text;
BEGIN
  FOREACH s IN ARRAY ARRAY[
    'public.can_manage_catalog_tecnico(uuid)',
    'public.can_view_catalog_internal(uuid)',
    'public.can_manage_technical_visit(uuid,uuid)',
    'public.can_view_technical_visit(uuid,uuid)',
    'public.fn_fiscal_can_operate(uuid)',
    'public.fn_fiscal_can_read_internal(uuid)',
    'public.fn_regulatory_can_approve(text,uuid)',
    'public.fn_regulatory_can_prepare(uuid)',
    'public.fn_regulatory_can_read(uuid)',
    'public.get_cliente_id_for_user(uuid)',
    'public.fn_fiscal_company_crt()',
    'public.fn_microorganism_regulatory_facts(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', s);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', s);
  END LOOP;
END $do$;
