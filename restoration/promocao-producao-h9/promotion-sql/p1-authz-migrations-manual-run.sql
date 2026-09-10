-- ============================================================================
-- P1 — MIGRATIONS DE AUTORIZAÇÃO (execução manual em PRODUÇÃO)
-- Alvo: navfzbwgwzruipouyfnk
--
-- Conteúdo: as duas migrations históricas da onda P1, na ordem do manifesto:
--   1) 20261006000000_h9d1_authz_recurring_generation_v1
--      SHA-256 origem: cc5fe6a2d6664b5ec1a68fc2d64c11ff5738abf3ce8947a42577a5196a2841e5
--   2) 20261015000000_h9dl4r2_authz_scoped_convert_no_oracle_v1
--      SHA-256 origem: 30c76876bbf85f37c5d741538cc9071eb176222f39a5702c16b53abd128a0c53
--
-- Os corpos das funções são reproduzidos BYTE A BYTE dos arquivos de origem em
-- restoration/homologacao-h9/h9d-forwards/. O que foi acrescentado aqui, e nada
-- mais, é: guarda de alvo, prechecks de dependência, transação explícita por
-- migration e pós-checks. Nenhuma ACL é alterada além do que a origem já fazia.
--
-- NÃO altera dados. NÃO cria tabela. NÃO toca cron, fiscal, comunicação, Edge
-- Functions ou frontend. NÃO escreve em supabase_migrations.schema_migrations.
--
-- COMO EXECUTAR (psql, sessão direta autenticada na produção):
--   psql "<conexão de produção>" -v ON_ERROR_STOP=1 \
--        -f p1-authz-migrations-manual-run.sql
--
-- ORDEM OBRIGATÓRIA: rodar DEPOIS de 20261101000000 (convergência/ledger).
-- Se a convergência ainda não tiver sido aplicada, este script funciona, mas
-- não haverá tabela de auditoria para registrar o par origem/hash — nesse caso
-- registre a execução manualmente na evidência da janela.
--
-- Após COMMIT e pós-checks OK, registrar o ledger pelo caminho suportado:
--   supabase migration repair --status applied 20261006000000
--   supabase migration repair --status applied 20261015000000
-- Nunca antes dos pós-checks.
--
-- ROLLBACK: restaurar as definições anteriores com
--   restoration/homologacao-h9/h9d-rollbacks/20261006000000_h9d1_authz_recurring_generation_v1_rollback.sql
--   restoration/homologacao-h9/h9d-rollbacks/20261015000000_h9dl4r2_authz_scoped_convert_no_oracle_v1_rollback.sql
-- Reverter reintroduz as vulnerabilidades de autorização; exige autorização humana.
-- ============================================================================
\set ON_ERROR_STOP on
\timing on

-- ---------------------------------------------------------------------------
-- BLOCO 0 — Identidade do alvo (somente leitura). Conferir ANTES de prosseguir.
-- ---------------------------------------------------------------------------
SELECT current_database() AS db,
       current_user       AS usuario,
       version()          AS pg_version,
       now() AT TIME ZONE 'UTC' AS ts_utc;

SELECT count(*) AS ledger_total, max(version) AS ledger_ultima
FROM supabase_migrations.schema_migrations;

-- Snapshot das definições e ACLs ANTES (arquivar como evidência / base de rollback).
SELECT p.oid::regprocedure AS assinatura,
       p.prosecdef         AS security_definer,
       p.proconfig         AS config,
       pg_get_functiondef(p.oid) AS definicao_anterior,
       (SELECT array_agg(a.acl::text)
          FROM unnest(coalesce(p.proacl, '{}'::aclitem[])) a(acl)) AS acl_anterior
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (p.oid::regprocedure::text IN (
        'fn_run_recurring_generation()',
        'rpc_converter_visita_em_os(uuid,text)'))
ORDER BY 1;


-- ===========================================================================
-- MIGRATION 1/2 — 20261006000000_h9d1_authz_recurring_generation_v1
-- ===========================================================================
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $guard$
BEGIN
  IF current_setting('promocao.target_ref', true) IS DISTINCT FROM 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'ALVO_INVALIDO: promocao.target_ref ausente ou diferente do alvo de producao.';
  END IF;
END
$guard$;

-- PRECHECK fail-closed: função alvo e dependências têm de existir.
DO $pre$
BEGIN
  IF to_regprocedure('public.fn_run_recurring_generation()') IS NULL THEN
    RAISE EXCEPTION 'PRECHECK_FALHOU: public.fn_run_recurring_generation() nao existe no alvo.';
  END IF;
  IF to_regprocedure('public.is_financial_staff(uuid)') IS NULL THEN
    RAISE EXCEPTION 'PRECHECK_FALHOU: dependencia public.is_financial_staff(uuid) ausente.';
  END IF;
  IF to_regprocedure('public.fn_generate_recurring_title(uuid,date,boolean)') IS NULL THEN
    RAISE EXCEPTION 'PRECHECK_FALHOU: dependencia public.fn_generate_recurring_title(uuid,date,boolean) ausente.';
  END IF;
  IF to_regclass('public.recurring_financial_templates') IS NULL
     OR to_regclass('public.recurring_generation_log') IS NULL
     OR to_regclass('public.financial_audit_log') IS NULL THEN
    RAISE EXCEPTION 'PRECHECK_FALHOU: tabela(s) de suporte da geracao recorrente ausente(s).';
  END IF;
END
$pre$;

-- ---- INÍCIO DO CONTEÚDO DE ORIGEM (inalterado) ----------------------------
-- H9-D1: autorização server-side em public.fn_run_recurring_generation()
-- Vulnerabilidade comprovada: qualquer usuário authenticated sem papel financeiro
-- executava a rotina, enumerava templates recorrentes ativos e provocava escritas
-- em recurring_generation_log e financial_audit_log. Guarda idêntica à já existente
-- em fn_generate_recurring_title (padrão H7O): sessão sem JWT (cron) preservada.
CREATE OR REPLACE FUNCTION public.fn_run_recurring_generation()
 RETURNS TABLE(template_id uuid, status text, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r RECORD; v_id UUID;
BEGIN
  -- H9-D1: sessão interna/cron (sem JWT) preservada; chamada autenticada exige staff financeiro.
  IF auth.uid() IS NOT NULL AND NOT public.is_financial_staff(auth.uid()) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501',
      HINT = 'H9-D1: execução da geração recorrente restrita ao staff financeiro.';
  END IF;

  FOR r IN
    SELECT id, next_generation_date
    FROM public.recurring_financial_templates
    WHERE active = true AND auto_generate = true
      AND next_generation_date IS NOT NULL
      AND next_generation_date <= CURRENT_DATE
      AND (end_date IS NULL OR next_generation_date <= end_date)
  LOOP
    BEGIN
      v_id := public.fn_generate_recurring_title(r.id, r.next_generation_date, false);
      template_id := r.id;
      status := CASE WHEN v_id IS NULL THEN 'SKIPPED' ELSE 'SUCCESS' END;
      message := NULL;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.recurring_generation_log(template_id, reference_date, status, error_message)
      VALUES (r.id, r.next_generation_date, 'FAILED', SQLERRM);
      INSERT INTO public.financial_audit_log(entity_type, entity_id, action, new_data, performed_by, reason)
      VALUES ('RECURRING_TEMPLATE', r.id, 'RECURRING_GENERATION_FAILED',
              jsonb_build_object('reference_date', r.next_generation_date), auth.uid(), SQLERRM);
      template_id := r.id; status := 'FAILED'; message := SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;
END $function$;
-- ---- FIM DO CONTEÚDO DE ORIGEM --------------------------------------------

-- PÓS-CHECK na mesma transação.
DO $post$
DECLARE
  v_def text;
  v_oid oid := to_regprocedure('public.fn_run_recurring_generation()')::oid;
BEGIN
  SELECT pg_get_functiondef(v_oid) INTO v_def;

  IF v_def IS NULL OR position('is_financial_staff' IN v_def) = 0 THEN
    RAISE EXCEPTION 'POSTCHECK_FALHOU: guarda is_financial_staff ausente no corpo aplicado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_oid AND prosecdef) THEN
    RAISE EXCEPTION 'POSTCHECK_FALHOU: funcao deixou de ser SECURITY DEFINER.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p, unnest(coalesce(p.proconfig,'{}')) cfg
    WHERE p.oid = v_oid AND cfg = 'search_path=public'
  ) THEN
    RAISE EXCEPTION 'POSTCHECK_FALHOU: search_path nao esta fixado em public.';
  END IF;
  IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'POSTCHECK_FALHOU: anon pode executar a funcao.';
  END IF;
END
$post$;

COMMIT;


-- ===========================================================================
-- MIGRATION 2/2 — 20261015000000_h9dl4r2_authz_scoped_convert_no_oracle_v1
-- ===========================================================================
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $guard$
BEGIN
  IF current_setting('promocao.target_ref', true) IS DISTINCT FROM 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'ALVO_INVALIDO: promocao.target_ref ausente ou diferente do alvo de producao.';
  END IF;
END
$guard$;

-- PRECHECK fail-closed: função alvo, helper de papel, enum e tabelas usadas.
DO $pre$
DECLARE
  v_faltando text;
BEGIN
  IF to_regprocedure('public.rpc_converter_visita_em_os(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'PRECHECK_FALHOU: public.rpc_converter_visita_em_os(uuid,text) nao existe no alvo.';
  END IF;
  IF to_regtype('public.app_role') IS NULL THEN
    RAISE EXCEPTION 'PRECHECK_FALHOU: tipo public.app_role ausente.';
  END IF;
  IF to_regprocedure('public.has_role(uuid,public.app_role)') IS NULL THEN
    RAISE EXCEPTION 'PRECHECK_FALHOU: dependencia public.has_role(uuid, app_role) ausente.';
  END IF;

  SELECT string_agg(t.nome, ', ' ORDER BY t.nome) INTO v_faltando
  FROM (VALUES ('registros_consultor'),
               ('registros_consultor_recomendacoes'),
               ('registros_consultor_status_log'),
               ('ordens_servico_onfarm'),
               ('portal_solicitacoes'),
               ('solicitacoes_timeline'),
               ('visitas_logs')) AS t(nome)
  WHERE to_regclass('public.' || t.nome) IS NULL;

  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'PRECHECK_FALHOU: tabela(s) ausente(s): %', v_faltando;
  END IF;

  -- Os quatro papéis usados pela guarda precisam existir no enum.
  SELECT string_agg(r.nome, ', ' ORDER BY r.nome) INTO v_faltando
  FROM (VALUES ('administrador'),('gestor'),('consultor_tecnico'),('tecnico_agronomo')) AS r(nome)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type ty ON ty.oid = e.enumtypid
    WHERE ty.typname = 'app_role' AND e.enumlabel = r.nome
  );

  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'PRECHECK_FALHOU: rotulo(s) ausente(s) em app_role: %', v_faltando;
  END IF;
END
$pre$;

-- ---- INÍCIO DO CONTEÚDO DE ORIGEM (inalterado) ----------------------------
-- H9-D-L4 RETIFICAÇÃO 2 (20261015000000)
-- Defeito: rpc_converter_visita_em_os ainda distinguia, para usuários COM papel de domínio,
--   * UUID inexistente -> 'Visita técnica não encontrada.'
--   * visita alheia     -> 'Sem permissão para converter esta visita.'
-- Correção: resolução + autorização em UMA consulta escopada ao chamador; ambos os casos
-- retornam a MESMA mensagem genérica. Conversão legítima, idempotência, transições,
-- auditoria, contrato de retorno, ACL e search_path preservados.

CREATE OR REPLACE FUNCTION public.rpc_converter_visita_em_os(p_registro_id uuid, p_observacao text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_registro RECORD;
  v_rec RECORD;
  v_rec_count int;
  v_existing_os RECORD;
  v_new_os_id uuid;
  v_new_numero text;
  v_status_anterior text;
  v_solic_id uuid;
  v_is_consultor_resp boolean;
  v_has_admin boolean;
  v_has_gestor boolean;
  v_has_consultor boolean;
  v_has_tecnico boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Não autenticado');
  END IF;

  -- H9-D-L4: gate de capacidade ANTES de qualquer leitura do registro.
  -- Fecha o oráculo de existência (não-encontrado vs sem-permissão) para
  -- identidades sem papel de domínio de visita técnica.
  IF NOT (
    public.has_role(v_user_id, 'administrador'::app_role)
    OR public.has_role(v_user_id, 'gestor'::app_role)
    OR public.has_role(v_user_id, 'consultor_tecnico'::app_role)
    OR public.has_role(v_user_id, 'tecnico_agronomo'::app_role)
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Sem permissão para converter esta visita.');
  END IF;

  -- H9-D-L4-R2: resolução ESCOPADA ao chamador em UMA única consulta.
  -- Inexistente e alheio produzem a MESMA resposta genérica, sem revelar existência.
  v_has_admin    := public.has_role(v_user_id, 'administrador'::app_role);
  v_has_gestor   := public.has_role(v_user_id, 'gestor'::app_role);
  v_has_consultor:= public.has_role(v_user_id, 'consultor_tecnico'::app_role);
  v_has_tecnico  := public.has_role(v_user_id, 'tecnico_agronomo'::app_role);

  SELECT * INTO v_registro
    FROM public.registros_consultor rc
   WHERE rc.id = p_registro_id
     AND (
       v_has_admin
       OR v_has_gestor
       OR ((v_has_consultor OR v_has_tecnico) AND rc.consultor_responsavel = v_user_id)
     );

  IF v_registro IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Sem permissão para converter esta visita.');
  END IF;

  v_is_consultor_resp := (v_registro.consultor_responsavel = v_user_id);

  -- OS já existente → retorno idempotente
  SELECT id, numero_os INTO v_existing_os
    FROM public.ordens_servico_onfarm
   WHERE registro_consultor_id = p_registro_id
   LIMIT 1;

  IF v_existing_os.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_exists', true,
      'os_id', v_existing_os.id,
      'numero_os', v_existing_os.numero_os,
      'registro_id', p_registro_id,
      'message', 'OS já existente para esta visita.'
    );
  END IF;

  -- Validações de status
  IF v_registro.status::text = 'arquivado' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Visita arquivada não pode gerar OS.');
  END IF;
  IF v_registro.status::text = 'convertido_os' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Visita já foi convertida em OS.');
  END IF;
  IF v_registro.status::text <> 'aprovado' THEN
    RETURN jsonb_build_object('success', false,
      'message', 'Apenas visitas com recomendação aprovada podem ser convertidas em OS.');
  END IF;

  -- Campos obrigatórios
  IF v_registro.cliente_id IS NULL
     OR v_registro.fazenda_id IS NULL
     OR v_registro.talhao_id  IS NULL THEN
    RETURN jsonb_build_object('success', false,
      'message', 'Visita sem cliente, fazenda ou talhão definidos.');
  END IF;

  -- Recomendação real
  SELECT * INTO v_rec
    FROM public.registros_consultor_recomendacoes
   WHERE registro_consultor_id = p_registro_id
     AND (
       coalesce(btrim(recomendacao_tecnica), '') <> ''
       OR coalesce(btrim(observacoes_finais), '') <> ''
       OR coalesce(btrim(estrategia_manejo), '') <> ''
     )
   ORDER BY created_at DESC NULLS LAST
   LIMIT 1;

  IF v_rec IS NULL THEN
    RETURN jsonb_build_object('success', false,
      'message', 'Não existe recomendação técnica preenchida para esta visita.');
  END IF;

  v_status_anterior := v_registro.status::text;
  v_solic_id := v_registro.solicitacao_id;

  -- Inserir OS On-Farm (status inicial: aberta)
  INSERT INTO public.ordens_servico_onfarm (
    cliente_id, fazenda_id, talhao_id, produto_id,
    area_hectares, modo_aplicacao,
    prioridade, status,
    registro_consultor_id, solicitacao_id, consultor_responsavel, cultura_id,
    fase_fenologica, problema_principal, diagnostico, recomendacao_tecnica,
    observacoes_adicionais, created_by
  ) VALUES (
    v_registro.cliente_id, v_registro.fazenda_id, v_registro.talhao_id,
    v_rec.produto_biologico_sugerido_id,
    v_registro.area_hectares,
    v_rec.modo_aplicacao,
    'media', 'aberta',
    p_registro_id, v_solic_id, v_registro.consultor_responsavel, v_registro.cultura_id,
    v_registro.fase_fenologica, v_registro.problema_principal, NULL,
    coalesce(v_rec.recomendacao_tecnica, v_rec.observacoes_finais, v_rec.estrategia_manejo),
    p_observacao, v_user_id
  )
  RETURNING id, numero_os INTO v_new_os_id, v_new_numero;

  -- Atualizar status visita
  UPDATE public.registros_consultor
     SET status = 'convertido_os', updated_at = now()
   WHERE id = p_registro_id;

  -- Atualizar solicitação
  IF v_solic_id IS NOT NULL THEN
    UPDATE public.portal_solicitacoes
       SET status = 'convertida_os', updated_at = now()
     WHERE id = v_solic_id;

    INSERT INTO public.solicitacoes_timeline
      (solicitacao_id, tipo_evento, descricao, usuario_id)
    VALUES
      (v_solic_id, 'convertida_os',
       'Visita técnica convertida em OS On-Farm ' || coalesce(v_new_numero, v_new_os_id::text),
       v_user_id);
  END IF;

  -- Logs
  INSERT INTO public.registros_consultor_status_log
    (registro_consultor_id, status_anterior, status_novo, motivo, changed_by, changed_at)
  VALUES
    (p_registro_id, v_status_anterior, 'convertido_os',
     'Conversão da visita em OS On-Farm', v_user_id, now());

  INSERT INTO public.visitas_logs
    (registro_consultor_id, solicitacao_id, acao, descricao, usuario_id, metadata)
  VALUES
    (p_registro_id, v_solic_id, 'os_gerada',
     'Visita convertida em OS On-Farm ' || coalesce(v_new_numero, v_new_os_id::text),
     v_user_id,
     jsonb_build_object('os_id', v_new_os_id, 'numero_os', v_new_numero));

  RETURN jsonb_build_object(
    'success', true,
    'already_exists', false,
    'message', 'OS On-Farm gerada com sucesso.',
    'os_id', v_new_os_id,
    'numero_os', v_new_numero,
    'registro_id', p_registro_id,
    'solicitacao_id', v_solic_id,
    'status_anterior', v_status_anterior,
    'status_novo', 'convertido_os'
  );
EXCEPTION WHEN unique_violation THEN
  -- Caso outra requisição tenha criado a OS simultaneamente
  SELECT id, numero_os INTO v_existing_os
    FROM public.ordens_servico_onfarm
   WHERE registro_consultor_id = p_registro_id
   LIMIT 1;
  RETURN jsonb_build_object(
    'success', true,
    'already_exists', true,
    'os_id', v_existing_os.id,
    'numero_os', v_existing_os.numero_os,
    'message', 'OS já existente para esta visita.'
  );
WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message',
    'Erro ao converter visita em OS: ' || SQLERRM);
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_converter_visita_em_os(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_converter_visita_em_os(uuid, text) TO postgres, authenticated, service_role;
-- ---- FIM DO CONTEÚDO DE ORIGEM --------------------------------------------

-- PÓS-CHECK na mesma transação.
DO $post$
DECLARE
  v_def text;
  v_oid oid := to_regprocedure('public.rpc_converter_visita_em_os(uuid,text)')::oid;
BEGIN
  SELECT pg_get_functiondef(v_oid) INTO v_def;

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'POSTCHECK_FALHOU: funcao nao encontrada apos aplicacao.';
  END IF;
  -- O oráculo de existência foi fechado: a mensagem antiga não pode mais existir.
  IF position('Visita técnica não encontrada.' IN v_def) > 0 THEN
    RAISE EXCEPTION 'POSTCHECK_FALHOU: mensagem de oraculo de existencia ainda presente.';
  END IF;
  -- A resolução tem de ser escopada ao chamador na própria consulta.
  IF position('rc.consultor_responsavel = v_user_id' IN v_def) = 0 THEN
    RAISE EXCEPTION 'POSTCHECK_FALHOU: resolucao escopada ao chamador ausente.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_oid AND prosecdef) THEN
    RAISE EXCEPTION 'POSTCHECK_FALHOU: funcao deixou de ser SECURITY DEFINER.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p, unnest(coalesce(p.proconfig,'{}')) cfg
    WHERE p.oid = v_oid AND cfg = 'search_path=public'
  ) THEN
    RAISE EXCEPTION 'POSTCHECK_FALHOU: search_path nao esta fixado em public.';
  END IF;
  IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'POSTCHECK_FALHOU: anon pode executar a funcao.';
  END IF;
  IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'POSTCHECK_FALHOU: authenticated perdeu EXECUTE (regressao funcional).';
  END IF;
END
$post$;

COMMIT;


-- ---------------------------------------------------------------------------
-- BLOCO FINAL — Conferência somente leitura (arquivar a saída)
-- ---------------------------------------------------------------------------
SELECT p.oid::regprocedure AS assinatura,
       p.prosecdef AS security_definer,
       p.proconfig AS config,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.oid::regprocedure::text IN (
        'fn_run_recurring_generation()',
        'rpc_converter_visita_em_os(uuid,text)')
ORDER BY 1;

SELECT count(*) AS ledger_total, max(version) AS ledger_ultima
FROM supabase_migrations.schema_migrations;
-- O ledger NÃO muda com este script. Registrar as versions só depois, via
-- `supabase migration repair --status applied <version>`.
