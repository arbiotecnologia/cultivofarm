-- H7N ROLLBACK — P0 — views voltam a security_invoker=false (estado pré-H7N)
-- Reverte EXATAMENTE a migration 20260904130615_h7n_p0_security_invoker (staging ikaauvsflpmamgxmkhoq).
-- Estado anterior reconstruído a partir de restoration/homologacao-h7/97-h7n-p0p1-auditoria.md
-- e restoration/homologacao-h7/h7n-inventario/ (fn_inventory.tsv, viewdefs.sql).
-- Executar SOMENTE via guard-staging.sh + staging-psql.sh, dentro de transação.
-- NÃO executar em produção (navfzbwgwzruipouyfnk).
begin;

-- Guard fail-closed: apenas staging.
do $$
begin
  if not exists (
    select 1 from public.fiscal_environment_marker
    where project_ref = 'ikaauvsflpmamgxmkhoq' and environment_label = 'STAGING'
      and production_emission_allowed = false
  ) then
    raise exception 'H7N_ROLLBACK_STAGING_GUARD_FAILED';
  end if;
end $$;

-- 1) vw_os_integridade_esteira: definição inalterada pela forward; só a opção volta.
alter view public.vw_os_integridade_esteira set (security_invoker = false);

-- 2) Views que passaram a ler funções private.*: restaurar a definição original
--    (pg_get_viewdef capturada antes da forward) e security_invoker=false.
create or replace view public.vw_esteira_laboratorio
with (security_invoker = false)
as
SELECT os_id,
    origem_os,
    numero_os,
    cliente_id,
    fazenda_id,
    talhao_id,
    status_os,
    created_at,
    volume_total_ml,
    produto_id,
    microrganismo_id,
    prioridade,
    volume_solicitado_l,
    cliente_nome,
    fazenda_nome,
    talhao_nome,
    produto_nome,
    microrganismo_nome,
    partner_id,
    partner_numero,
    partner_nome,
    titular_tipo,
    titular_nome,
    programacao_id,
    status_programacao,
    data_programada,
    data_inicio_producao,
    lote_id,
    codigo_lote,
    status_lote,
    data_lote,
    cq_id,
    cq_resultado,
    data_cq,
    envase_id,
    data_envase,
    estoque_id,
    data_estoque,
    estoque_reservado_id,
    data_estoque_reservado,
    entrega_id,
    entrega_status,
    data_entrega,
    aplicacao_id,
    data_aplicacao,
    entrega_confirmada,
    aplicacao_bloqueante,
    pendencias_informativas,
    bloqueios,
    pode_finalizar,
    status_esteira_oficial,
    tempo_os_ate_programacao,
    tempo_programacao_ate_lote,
    tempo_lote_ate_cq,
    tempo_cq_ate_envase,
    tempo_envase_ate_entrega,
    tempo_os_ate_entrega,
    atrasado,
    proxima_acao
   FROM mv_esteira_laboratorio m
  WHERE has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'gestor'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role) OR has_role(auth.uid(), 'producao'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role) OR (has_role(auth.uid(), 'consultor_tecnico'::app_role) OR has_role(auth.uid(), 'tecnico_agronomo'::app_role)) AND (cliente_id = ANY (get_cliente_ids_for_user(auth.uid())));

create or replace view public.vw_fluxo_visita_tecnica
with (security_invoker = false)
as
SELECT origem_fluxo,
    solicitacao_id,
    numero_solicitacao,
    registro_consultor_id,
    codigo_visita,
    cliente_id,
    cliente_nome,
    fazenda_id,
    fazenda_nome,
    talhao_id,
    talhao_nome,
    cultura_id,
    cultura_nome,
    consultor_id,
    consultor_nome,
    status_solicitacao,
    status_visita,
    status_aprovacao,
    tipo_demanda,
    data_prevista_atendimento,
    data_checkin,
    data_vistoria,
    data_finalizacao,
    data_liberacao_recomendacao,
    data_conversao_os,
    possui_checkin,
    possui_diagnostico,
    quantidade_diagnosticos,
    possui_evidencias,
    quantidade_evidencias,
    possui_recomendacao,
    quantidade_recomendacoes,
    possui_os,
    os_id,
    numero_os,
    status_os,
    microrganismo_id,
    microrganismo_nome,
    proxima_acao,
    bloqueios,
    dias_em_aberto,
    tempo_solicitacao_ate_checkin,
    tempo_checkin_ate_finalizacao,
    tempo_finalizacao_ate_aprovacao,
    tempo_aprovacao_ate_os,
    created_at,
    updated_at
   FROM mv_fluxo_visita_tecnica m
  WHERE has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'gestor'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role) OR has_role(auth.uid(), 'producao'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role) OR (has_role(auth.uid(), 'consultor_tecnico'::app_role) OR has_role(auth.uid(), 'tecnico_agronomo'::app_role)) AND (consultor_id = auth.uid() OR (cliente_id = ANY (get_cliente_ids_for_user(auth.uid()))));

create or replace view public.vw_catalogo_ficha_produtos
with (security_invoker = false)
as
SELECT id,
    nome,
    codigo,
    tipo,
    descricao,
    ativo,
    COALESCE(fn_catalogo_preco_canonico(id, NULL::uuid, 'dose'::text, NULL::numeric), valor_dose_brl) AS valor_dose_brl,
    COALESCE(fn_catalogo_preco_canonico(id, NULL::uuid, 'litro'::text, NULL::numeric), valor_litro_brl) AS valor_litro_brl,
    COALESCE(fn_catalogo_preco_canonico(id, NULL::uuid, 'hectare'::text, NULL::numeric), valor_ha_brl) AS valor_ha_brl,
    dose_ml_ha,
        CASE
            WHEN fn_catalogo_preco_canonico(id, NULL::uuid, 'litro'::text, NULL::numeric) IS NOT NULL THEN 'catalogo_volumes'::text
            ELSE 'legado_mestre'::text
        END AS preco_fonte
   FROM produtos p
  WHERE ativo = true AND (can_view_catalog_internal(auth.uid()) OR (NOT (EXISTS ( SELECT 1
           FROM product_technical_profiles tp
          WHERE tp.produto_id = p.id)) OR (EXISTS ( SELECT 1
           FROM product_technical_profiles tp
          WHERE tp.produto_id = p.id AND tp.status_validacao = 'aprovado'::text))) AND (NOT (has_role(auth.uid(), 'parceiro_b2b'::app_role) OR has_role(auth.uid(), 'parceiro_b2b_tecnico'::app_role)) OR COALESCE(b2b_enabled, false) = true));

create or replace view public.vw_catalogo_ficha_microrganismos
with (security_invoker = false)
as
SELECT id,
    nome,
    nome_cientifico,
    funcao_agronomica,
    ativo,
    COALESCE(fn_catalogo_preco_canonico(NULL::uuid, id, 'dose'::text, NULL::numeric), valor_dose_brl) AS valor_dose_brl,
    COALESCE(fn_catalogo_preco_canonico(NULL::uuid, id, 'litro'::text, NULL::numeric), valor_litro_brl) AS valor_litro_brl,
    dose_ml_ha,
        CASE
            WHEN fn_catalogo_preco_canonico(NULL::uuid, id, 'litro'::text, NULL::numeric) IS NOT NULL THEN 'catalogo_volumes'::text
            ELSE 'legado_mestre'::text
        END AS preco_fonte
   FROM microrganismos m
  WHERE ativo = true AND (can_view_catalog_internal(auth.uid()) OR (NOT (EXISTS ( SELECT 1
           FROM microorganism_technical_profiles tp
          WHERE tp.microrganismo_id = m.id)) OR (EXISTS ( SELECT 1
           FROM microorganism_technical_profiles tp
          WHERE tp.microrganismo_id = m.id AND tp.status_validacao = 'aprovado'::text))) AND (NOT (has_role(auth.uid(), 'parceiro_b2b'::app_role) OR has_role(auth.uid(), 'parceiro_b2b_tecnico'::app_role)) OR COALESCE(b2b_enabled, false) = true));

-- 3) Grants originais (repo: GRANT SELECT ... TO authenticated, service_role; anon sem acesso).
revoke all on public.vw_os_integridade_esteira from public, anon, authenticated, service_role;
revoke all on public.vw_esteira_laboratorio from public, anon, authenticated, service_role;
revoke all on public.vw_fluxo_visita_tecnica from public, anon, authenticated, service_role;
revoke all on public.vw_catalogo_ficha_produtos from public, anon, authenticated, service_role;
revoke all on public.vw_catalogo_ficha_microrganismos from public, anon, authenticated, service_role;
grant select on public.vw_os_integridade_esteira to authenticated, service_role;
grant select on public.vw_esteira_laboratorio to authenticated, service_role;
grant select on public.vw_fluxo_visita_tecnica to authenticated, service_role;
grant select on public.vw_catalogo_ficha_produtos to authenticated, service_role;
grant select on public.vw_catalogo_ficha_microrganismos to authenticated, service_role;

-- 4) Funções private.* criadas pela forward (sem outros dependentes após o passo 2).
drop function if exists private.h7n_esteira_laboratorio();
drop function if exists private.h7n_fluxo_visita_tecnica();
drop function if exists private.h7n_catalogo_ficha_produtos();
drop function if exists private.h7n_catalogo_ficha_microrganismos();

-- 5) Schema private não existia antes da forward (nenhuma migration anterior o referencia).
--    Removido apenas se estiver vazio — fail-safe contra objetos criados por terceiros.
do $$
declare v_count int;
begin
  select count(*) into v_count
  from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'private';
  select v_count + count(*) into v_count
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private';
  if v_count = 0 then
    execute 'drop schema if exists private';
  else
    raise notice 'H7N_ROLLBACK: schema private mantido (% objetos remanescentes)', v_count;
  end if;
end $$;

-- Verificação pós-rollback (falha se algo ficou em security_invoker=true).
do $$
declare v_bad int;
begin
  select count(*) into v_bad
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v'
    and c.relname in ('vw_os_integridade_esteira','vw_esteira_laboratorio','vw_fluxo_visita_tecnica',
                      'vw_catalogo_ficha_produtos','vw_catalogo_ficha_microrganismos')
    and coalesce(array_to_string(c.reloptions, ','), '') ilike '%security_invoker=true%';
  if v_bad <> 0 then
    raise exception 'H7N_ROLLBACK_P0_VERIFY_FAILED: % views ainda com security_invoker=true', v_bad;
  end if;
end $$;
commit;
