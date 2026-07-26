-- Precheck Fase 2 v2 (read-only). Aborta se pré-requisitos ausentes.
DO $$
DECLARE v_missing text;
BEGIN
  -- Fase 1 aplicada?
  FOREACH v_missing IN ARRAY ARRAY[
    'comunicacao_templates','comunicacao_regras','comunicacao_eventos',
    'comunicacao_outbox','comunicacao_preferencias','comunicacao_audit_log',
    'comunicacao_consent_log'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema='public' AND table_name=v_missing) THEN
      RAISE EXCEPTION 'precheck: Fase 1 ausente — tabela % não existe', v_missing;
    END IF;
  END LOOP;

  -- Tabelas de negócio esperadas
  FOREACH v_missing IN ARRAY ARRAY[
    'ordens_servico','ordens_servico_onfarm','profiles','clientes',
    'portal_notificacoes','notificacoes_operacionais','user_roles'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema='public' AND table_name=v_missing) THEN
      RAISE EXCEPTION 'precheck: tabela requerida % não existe', v_missing;
    END IF;
  END LOOP;

  -- Enums
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='status_os') THEN
    RAISE EXCEPTION 'precheck: enum status_os ausente'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid
                   WHERE t.typname='status_os' AND e.enumlabel='pronto_entrega') THEN
    RAISE EXCEPTION 'precheck: status_os sem pronto_entrega'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid
                   WHERE t.typname='status_os_onfarm' AND e.enumlabel='pronto_entrega') THEN
    RAISE EXCEPTION 'precheck: status_os_onfarm sem pronto_entrega'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='app_role') THEN
    RAISE EXCEPTION 'precheck: enum app_role ausente'; END IF;

  -- Validação por-coluna de cada tabela consumida pelos helpers/triggers.
  -- Cada par (tabela, coluna) precisa existir. Aborta com nome preciso.
  DECLARE
    v_pair text; v_tbl text; v_col text;
    v_pairs text[] := ARRAY[
      -- ordens_servico regular
      'ordens_servico.id','ordens_servico.status','ordens_servico.cliente_id',
      'ordens_servico.numero_os','ordens_servico.data_programada',
      -- ordens_servico_onfarm: NÃO tem data_programada; usa data_recomendada
      'ordens_servico_onfarm.id','ordens_servico_onfarm.status',
      'ordens_servico_onfarm.cliente_id','ordens_servico_onfarm.numero_os',
      'ordens_servico_onfarm.data_recomendada',
      -- profiles
      'profiles.user_id','profiles.nome','profiles.cliente_id',
      'profiles.ativo','profiles.telefone','profiles.email',
      -- clientes
      'clientes.id','clientes.nome','clientes.telefone',
      'clientes.telefones','clientes.email',
      -- notificações (destinos in_app)
      'portal_notificacoes.cliente_id','portal_notificacoes.titulo',
      'portal_notificacoes.mensagem','portal_notificacoes.tipo',
      'notificacoes_operacionais.user_id','notificacoes_operacionais.titulo',
      'notificacoes_operacionais.mensagem','notificacoes_operacionais.tipo',
      -- user_roles usado por broadcast_role/by_role
      'user_roles.user_id','user_roles.role'
    ];
  BEGIN
    FOREACH v_pair IN ARRAY v_pairs LOOP
      v_tbl := split_part(v_pair, '.', 1);
      v_col := split_part(v_pair, '.', 2);
      PERFORM 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name=v_tbl AND column_name=v_col;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'precheck: coluna requerida ausente — public.%.%', v_tbl, v_col;
      END IF;
    END LOOP;
  END;

  -- Guarda explícita: ordens_servico_onfarm NÃO deve ter data_programada
  -- (evita futuras migrations criarem coluna homônima e mascararem bugs).
  PERFORM 1 FROM information_schema.columns
   WHERE table_schema='public' AND table_name='ordens_servico_onfarm'
     AND column_name='data_programada';
  IF FOUND THEN
    RAISE NOTICE 'precheck: aviso — ordens_servico_onfarm.data_programada existe; helper on-farm continua usando data_recomendada por contrato';
  END IF;


  -- Fase 1: RPCs canônicas
  FOREACH v_missing IN ARRAY ARRAY[
    'rpc_publish_communication_event','rpc_claim_communication_outbox',
    'rpc_complete_communication_delivery','rpc_fail_communication_delivery',
    '_comunicacao_resolve_template','_comunicacao_resolve_recipients',
    '_comunicacao_can_deliver','_comunicacao_build_snapshot'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                    WHERE n.nspname='public' AND p.proname=v_missing) THEN
      RAISE EXCEPTION 'precheck: função da Fase 1 ausente: %', v_missing;
    END IF;
  END LOOP;

  -- Fase 2 não deve estar aplicada
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
              WHERE n.nspname='public' AND p.proname='rpc_dispatch_inapp_notification') THEN
    RAISE EXCEPTION 'precheck: rpc_dispatch_inapp_notification já existe (Fase 2 parcialmente aplicada?)';
  END IF;

  RAISE NOTICE 'precheck Fase 2 v2: OK';
END$$;
